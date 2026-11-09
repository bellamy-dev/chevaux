#!/usr/bin/env python3
"""Génère src/data/breeds.json à partir de la liste des races chevalines de Wikipédia.

Source : https://fr.wikipedia.org/wiki/Liste_de_races_chevalines
Images : Wikimedia Commons (crédits et licences récupérés via l'API).
"""

import json
import re
import ssl
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import certifi
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data" / "breeds.json"
CREDITS_CACHE = ROOT / ".cache" / "commons-credits.json"
FR_API = "https://fr.wikipedia.org/w/api.php"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
HEADERS = {
    "User-Agent": "RacesDeChevaux/1.0 (site encyclopedique; contact: bellamy-dev)",
}
PAGE = "Liste de races chevalines"
SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())


def api_get(url, params):
    params = {**params, "format": "json", "formatversion": "2", "maxlag": 5}
    query = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"{url}?{query}", headers=HEADERS)
    for attempt in range(7):
        try:
            with urllib.request.urlopen(req, timeout=60, context=SSL_CONTEXT) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code == 429:
                wait = int(error.headers.get("Retry-After", 45))
                print(f"Limite de débit atteinte, pause {wait} s…")
                time.sleep(wait)
                continue
            if attempt == 6:
                raise
            time.sleep(3 * (attempt + 1))
        except Exception:
            if attempt == 6:
                raise
            time.sleep(2 * (attempt + 1))


def clean(text):
    text = re.sub(r"\[\s*\d+\s*\]", "", text)
    text = re.sub(r"\s+([,;:.])", r"\1", text)
    text = re.sub(r"\(\s*\)", "", text)
    return re.sub(r"\s+", " ", text).strip()


def cell_text(cell):
    return clean(cell.get_text(" ", strip=True))


def split_name(full_name):
    parts = [part.strip() for part in full_name.split(",") if part.strip()]
    if not parts:
        return full_name, ""
    return parts[0], ", ".join(parts[1:])


def upscale(url, width=960):
    if not url:
        return None
    if url.startswith("//"):
        url = "https:" + url
    url = url.split("?")[0]
    return re.sub(r"/\d+px-", f"/{width}px-", url)


def file_from_href(href):
    if not href or "/wiki/Fichier:" not in href and "/wiki/File:" not in href:
        return None
    name = href.split(":", 1)[1]
    return urllib.parse.unquote(name).replace("_", " ")


def wiki_title_from_cell(cell):
    link = cell.find("a")
    if not link:
        return None
    href = link.get("href", "")
    if not href.startswith("/wiki/"):
        return None
    title = urllib.parse.unquote(href[len("/wiki/"):]).split("#")[0]
    if re.match(r"^(Aide|Wikipédia|Catégorie|Fichier|File|Spécial):", title):
        return None
    return title.replace("_", " ")


def categories_for(type_name):
    value = type_name.lower()
    categories = []
    if "poney" in value or "miniature" in value:
        categories.append("Poney")
    if any(word in value for word in ("trait", "lourd", "carrossier", "travail")):
        categories.append("Trait")
    if any(word in value for word in ("steppe", "sauvage")):
        categories.append("Steppe")
    if any(
        word in value
        for word in (
            "selle",
            "sport",
            "course",
            "baroque",
            "ibérique",
            "oriental",
            "allures",
            "montagne",
            "cob",
        )
    ):
        categories.append("Selle")
    return categories or ["Autre"]


def sort_key(value):
    normalized = unicodedata.normalize("NFD", value.lower())
    return "".join(char for char in normalized if unicodedata.category(char) != "Mn")


print("Récupération de la liste…")
page = api_get(FR_API, {"action": "parse", "page": PAGE, "prop": "text"})
soup = BeautifulSoup(page["parse"]["text"], "html.parser")

heading = next(
    h for h in soup.find_all(["h2", "h3"]) if "races chevalines subsistantes" in h.get_text()
)
wrapper = heading.parent if "mw-heading" in (heading.parent.get("class") or []) else heading

tables = []
node = wrapper
while True:
    node = node.find_next_sibling()
    if node is None:
        break
    if node.name == "div" and "mw-heading2" in (node.get("class") or []):
        break
    if node.name == "table":
        tables.append(node)

rows = [
    tr.find_all("td", recursive=False)
    for table in tables
    for tr in table.find_all("tr")
    if tr.find_all("td", recursive=False)
]

breeds = []
seen = set()
for cells in rows:
    if len(cells) < 7:
        continue
    name_full = cell_text(cells[0])
    if not name_full:
        continue
    image_cell = cells[7] if len(cells) > 7 else None
    img = image_cell.find("img") if image_cell else None
    file_name = None
    image_url = None
    if img:
        image_url = upscale(img.get("src"))
        link = image_cell.find("a")
        file_name = file_from_href(link.get("href") if link else None)

    country = cell_text(cells[4])
    type_name = cell_text(cells[3]) or "Non classé"
    name, alt_name = split_name(name_full)
    key = (name.lower(), country.lower())
    if key in seen:
        continue
    seen.add(key)

    breeds.append(
        {
            "name": name,
            "altName": alt_name,
            "originalName": cell_text(cells[1]),
            "usages": cell_text(cells[2]),
            "type": type_name,
            "categories": categories_for(type_name),
            "country": country,
            "size": cell_text(cells[5]),
            "population": cell_text(cells[6]),
            "wikiTitle": wiki_title_from_cell(cells[0]),
            "image": image_url,
            "imageFile": file_name,
            "imageSource": "table" if image_url else None,
        }
    )

print(f"{len(breeds)} races, {sum(1 for b in breeds if b['image'])} avec image dans le tableau")

# Complète les images manquantes via l'image d'infobox Wikipédia.
missing = [b for b in breeds if not b["image"] and b["wikiTitle"]]
for start in range(0, len(missing), 50):
    batch = missing[start : start + 50]
    result = api_get(
        FR_API,
        {
            "action": "query",
            "prop": "pageimages",
            "piprop": "thumbnail|name",
            "pithumbsize": 960,
            "redirects": 1,
            "titles": "|".join(b["wikiTitle"] for b in batch),
        },
    )
    query = result.get("query", {})
    pages = query.get("pages", [])
    by_title = {page["title"]: page for page in pages}
    normalized = {item["from"]: item["to"] for item in query.get("normalized", [])}
    redirects = {item["from"]: item["to"] for item in query.get("redirects", [])}

    for breed in batch:
        title = breed["wikiTitle"]
        title = normalized.get(title, title)
        title = redirects.get(title, title)
        page_data = by_title.get(title)
        if not page_data:
            continue
        thumb = page_data.get("thumbnail", {}).get("source")
        if not thumb:
            continue
        breed["image"] = upscale(thumb)
        breed["imageFile"] = page_data.get("pageimage")
        breed["imageSource"] = "wikipedia"
    print(f"Images Wikipédia : {min(start + 50, len(missing))}/{len(missing)}")

print(f"{sum(1 for b in breeds if b['image'])} races avec une image")

# Crédits et licences des fichiers Commons.
files = sorted({b["imageFile"] for b in breeds if b["imageFile"]})
metadata = {}
if CREDITS_CACHE.exists():
    metadata = json.loads(CREDITS_CACHE.read_text(encoding="utf-8"))
    print(f"{len(metadata)} crédits déjà en cache")

remaining = [name for name in files if name not in metadata or not metadata[name].get("thumb")]
for start in range(0, len(remaining), 50):
    batch = remaining[start : start + 50]
    result = api_get(
        COMMONS_API,
        {
            "action": "query",
            "prop": "imageinfo",
            "iiprop": "extmetadata|url",
            "iiurlwidth": 960,
            "titles": "|".join(f"File:{name}" for name in batch),
        },
    )
    for page_data in result.get("query", {}).get("pages", []):
        title = page_data.get("title", "")
        file_name = re.sub(r"^File:", "", title, flags=re.I).replace("_", " ")
        info = (page_data.get("imageinfo") or [{}])[0]
        ext = info.get("extmetadata", {})
        artist_html = ext.get("Artist", {}).get("value", "")
        artist = BeautifulSoup(artist_html, "html.parser").get_text(" ", strip=True) if artist_html else ""
        thumb = info.get("thumburl") or info.get("url") or ""
        metadata[file_name] = {
            "credit": clean(artist)[:160] or "Wikimedia Commons",
            "license": clean(ext.get("LicenseShortName", {}).get("value", "")) or "Voir le fichier",
            "licenseUrl": ext.get("LicenseUrl", {}).get("value", ""),
            "page": info.get("descriptionurl")
            or f"https://commons.wikimedia.org/wiki/File:{urllib.parse.quote(file_name)}",
            "thumb": thumb.split("?")[0] if thumb else "",
        }
    CREDITS_CACHE.parent.mkdir(parents=True, exist_ok=True)
    CREDITS_CACHE.write_text(json.dumps(metadata, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Crédits : {min(start + 50, len(remaining))}/{len(remaining)}")
    time.sleep(1.5)

for breed in breeds:
    meta = metadata.get(breed["imageFile"] or "", {})
    if meta.get("thumb"):
        breed["image"] = meta["thumb"]
    breed["credit"] = meta.get("credit", "Wikimedia Commons" if breed["image"] else "")
    breed["license"] = meta.get("license", "")
    breed["licenseUrl"] = meta.get("licenseUrl", "")
    breed["imagePage"] = meta.get(
        "page",
        f"https://commons.wikimedia.org/wiki/File:{urllib.parse.quote(breed['imageFile'] or '')}"
        if breed["imageFile"]
        else "",
    )
    breed["wikipedia"] = (
        f"https://fr.wikipedia.org/wiki/{urllib.parse.quote(breed['wikiTitle'].replace(' ', '_'))}"
        if breed["wikiTitle"]
        else ""
    )

breeds.sort(key=lambda item: sort_key(item["name"]))
countries = sorted({b["country"] for b in breeds if b["country"]}, key=sort_key)

payload = {
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "source": "https://fr.wikipedia.org/wiki/Liste_de_races_chevalines",
    "count": len(breeds),
    "countWithImage": sum(1 for b in breeds if b["image"]),
    "countries": countries,
    "breeds": breeds,
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"Écrit {OUT} ({OUT.stat().st_size / 1024:.0f} Ko)")
print(f"{payload['count']} races, {payload['countWithImage']} images, {len(countries)} pays")
