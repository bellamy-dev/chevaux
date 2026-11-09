const DATA_URL = `${import.meta.env.BASE_URL}data/breeds.json`;
const BATCH_SIZE = 24;
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const CATEGORY_LABELS = {
  all: "Toutes",
  Poney: "Poneys",
  Trait: "Trait",
  Selle: "Selle",
  Steppe: "Steppe",
  Autre: "Autres",
};

const CATEGORY_ORDER = ["Poney", "Trait", "Selle", "Steppe", "Autre"];

const FAMILIES = [
  {
    key: "Poney",
    kicker: "Format",
    description: "Petits formats, grands caractères. Des landes aux îles.",
    preferred: ["Shetland", "Fjord", "Haflinger", "Islandais", "Pottok"],
  },
  {
    key: "Trait",
    kicker: "Force",
    description: "La puissance au service du travail et de la traction.",
    preferred: ["Shire", "Ardennais", "Breton", "Boulonnais", "Percheron"],
  },
  {
    key: "Selle",
    kicker: "Équitation",
    description: "Sport, course, loisirs : les chevaux que l’on monte.",
    preferred: ["Lusitanien", "Pur-sang", "Arabe", "Camargue", "Pure race espagnole"],
  },
  {
    key: "Steppe",
    kicker: "Grands espaces",
    description: "Rustiques, endurants, nés des plaines et des lieux sauvages.",
    preferred: ["Akhal-Teké", "Mongol", "Kazakh", "Mustang", "Cheval de Heck"],
  },
  {
    key: "Autre",
    kicker: "Singularités",
    description: "Couleur, barbe, travail : les chevaux hors catégories.",
    preferred: ["Paint Horse", "Abyssinien", "Furioso-North Star", "Trotteur finlandais"],
  },
];

const state = {
  query: "",
  category: "all",
  country: "",
  visible: BATCH_SIZE,
};

let breeds = [];
let filteredBreeds = [];
let lastDialogTrigger = null;

const els = {
  search: document.querySelector("#search-input"),
  searchClear: document.querySelector("#search-clear"),
  country: document.querySelector("#country-filter"),
  chips: document.querySelector("#chips"),
  grid: document.querySelector("#grid"),
  resultCount: document.querySelector("#result-count"),
  resultLabel: document.querySelector("#result-label"),
  resultFilter: document.querySelector("#result-filter"),
  resetFilters: document.querySelector("#reset-filters"),
  empty: document.querySelector("#empty"),
  emptyReset: document.querySelector("#empty-reset"),
  loadMore: document.querySelector("#load-more"),
  loadMoreCount: document.querySelector("#load-more-count"),
  familyGrid: document.querySelector("#family-grid"),
  marquee: document.querySelector("#marquee-track"),
  dialog: document.querySelector("#breed-dialog"),
  dialogClose: document.querySelector("#dialog-close"),
  dialogImage: document.querySelector("#dialog-image"),
  dialogMedia: document.querySelector(".dialog-media"),
  dialogPlaceholder: document.querySelector("#dialog-placeholder"),
  dialogCredit: document.querySelector("#dialog-credit"),
  dialogOrigin: document.querySelector("#dialog-origin"),
  dialogName: document.querySelector("#dialog-name"),
  dialogAlt: document.querySelector("#dialog-alt"),
  dialogTags: document.querySelector("#dialog-tags"),
  dialogFacts: document.querySelector("#dialog-facts"),
  dialogLinks: document.querySelector("#dialog-links"),
  statRaces: document.querySelector("#stat-races"),
  statCountries: document.querySelector("#stat-countries"),
  statPhotos: document.querySelector("#stat-photos"),
};

const formatNumber = (value) => new Intl.NumberFormat("fr-FR").format(value);

const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character],
  );

const shortName = (name) => name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();

const getInitials = (name) =>
  normalize(name)
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 2)
    .toUpperCase() || "CH";

const primaryCategory = (breed) => breed.categories?.[0] || "Autre";

const smallImage = (url) => (url ? url.replace("/960px-", "/500px-") : "");

const findBreed = (prefix) => {
  const search = normalize(prefix);
  return (
    breeds.find((breed) => breed.image && normalize(breed.name) === search) ||
    breeds.find((breed) => breed.image && normalize(breed.name).startsWith(search))
  );
};

const scrollToCollection = () => {
  document.querySelector("#collection")?.scrollIntoView({
    behavior: REDUCED_MOTION ? "auto" : "smooth",
    block: "start",
  });
};

function setStats(data) {
  const races = data.count ?? breeds.length;
  const countries = data.countries?.length ?? new Set(breeds.map((breed) => breed.country)).size;
  const photos = data.countWithImage ?? breeds.filter((breed) => breed.image).length;

  els.statRaces.textContent = formatNumber(races);
  els.statCountries.textContent = formatNumber(countries);
  els.statPhotos.textContent = formatNumber(photos);

  const seal = document.querySelector(".hero-seal strong");
  if (seal) seal.textContent = formatNumber(races);
}

function renderHero() {
  const picks = [
    findBreed("Camargue"),
    findBreed("Akhal-Teké"),
    findBreed("Shire"),
  ];
  const fallbacks = breeds.filter(
    (breed) => breed.image && !picks.some((pick) => pick && pick.name === breed.name),
  );

  picks.forEach((breed, index) => {
    const resolved = breed || fallbacks[index];
    if (!resolved) return;
    const image = document.querySelector(`#hero-img-${index + 1}`);
    const caption = document.querySelector(`#hero-cap-${index + 1}`);
    if (!image) return;
    image.src = resolved.image;
    image.alt = `${resolved.name}, ${resolved.country}`;
    if (index === 0) image.fetchPriority = "high";
    if (caption) caption.textContent = `${shortName(resolved.name)} · ${resolved.country}`;
  });
}

function renderMarquee() {
  const wanted = [
    "Akhal-Teké",
    "Camargue",
    "Fjord",
    "Shire",
    "Lusitanien",
    "Islandais",
    "Arabe",
    "Paint Horse",
    "Shetland",
    "Haflinger",
    "Pure race espagnole",
    "Appaloosa",
    "Ardennais",
    "Mongol",
  ];
  const names = [];

  wanted.forEach((name) => {
    const breed = findBreed(name);
    if (breed && !names.includes(shortName(breed.name))) names.push(shortName(breed.name));
  });

  if (names.length < 10) {
    breeds.slice(0, 16).forEach((breed) => {
      const name = shortName(breed.name);
      if (!names.includes(name)) names.push(name);
    });
  }

  const items = names
    .map((name) => `<span class="marquee-item">${escapeHtml(name)}</span>`)
    .join("");
  els.marquee.innerHTML = `<div class="marquee-group">${items}</div><div class="marquee-group">${items}</div>`;
}

function renderChips() {
  const counts = Object.fromEntries(
    CATEGORY_ORDER.map((category) => [
      category,
      breeds.filter((breed) => breed.categories?.includes(category)).length,
    ]),
  );

  els.chips.innerHTML = [
    `<button class="chip" type="button" data-category="all" aria-pressed="false">${CATEGORY_LABELS.all}<span class="chip-count">${formatNumber(breeds.length)}</span></button>`,
    ...CATEGORY_ORDER.map(
      (category) =>
        `<button class="chip" type="button" data-category="${category}" aria-pressed="false">${CATEGORY_LABELS[category]}<span class="chip-count">${formatNumber(counts[category])}</span></button>`,
    ),
  ].join("");

  els.chips.title = "Une race peut appartenir à plusieurs familles.";
  updateChips();
}

function updateChips() {
  els.chips.querySelectorAll(".chip").forEach((chip) => {
    const active = chip.dataset.category === state.category;
    chip.classList.toggle("is-active", active);
    chip.setAttribute("aria-pressed", String(active));
  });
}

function renderCountries(countries) {
  const options = countries
    .map((country) => `<option value="${escapeHtml(country)}">${escapeHtml(country)}</option>`)
    .join("");
  els.country.innerHTML = `<option value="">Tous les pays</option>${options}`;
}

function renderFamilies() {
  els.familyGrid.innerHTML = FAMILIES.map((family) => {
    const count = breeds.filter((breed) => breed.categories?.includes(family.key)).length;
    const preferred = family.preferred.map((name) => findBreed(name)).filter(Boolean);
    const breed =
      preferred.find((candidate) => candidate.categories?.includes(family.key)) ||
      breeds.find((candidate) => candidate.image && candidate.categories?.includes(family.key));

    const image = breed?.image
      ? `<img src="${escapeHtml(smallImage(breed.image))}" srcset="${escapeHtml(smallImage(breed.image))} 500w, ${escapeHtml(breed.image)} 960w" sizes="(max-width: 480px) 100vw, (max-width: 760px) 50vw, 20vw" alt="${escapeHtml(breed.name)}" loading="lazy" decoding="async">`
      : "";

    return `
      <button class="family-card" type="button" data-family="${family.key}" aria-label="Filtrer la collection : ${CATEGORY_LABELS[family.key]}">
        ${image}
        <span class="family-count">${formatNumber(count)} races</span>
        <span class="family-content">
          <span class="family-kicker">${family.kicker}</span>
          <h3>${CATEGORY_LABELS[family.key]}</h3>
          <p>${family.description}</p>
        </span>
      </button>
    `;
  }).join("");
}

function cardTemplate(breed, index) {
  const category = primaryCategory(breed);
  const initials = getInitials(breed.name);
  const image = breed.image
    ? `<img
        src="${escapeHtml(smallImage(breed.image))}"
        ${smallImage(breed.image) !== breed.image ? `srcset="${escapeHtml(smallImage(breed.image))} 500w, ${escapeHtml(breed.image)} 960w"` : ""}
        sizes="(max-width: 480px) calc(100vw - 40px), (max-width: 760px) calc(50vw - 27px), (max-width: 1180px) calc(33vw - 40px), calc(25vw - 40px)"
        alt="${escapeHtml(`${breed.name}${breed.country ? `, ${breed.country}` : ""}`)}"
        loading="lazy"
        decoding="async"
        onerror="this.closest('.card-media').classList.add('is-placeholder'); this.remove();"
      >`
    : "";

  return `
    <article class="card" style="--i: ${index % 16}">
      <button
        class="card-button"
        type="button"
        data-breed-index="${index}"
        aria-label="Voir la fiche de ${escapeHtml(breed.name)}"
      >
        <div class="card-media ${breed.image ? "" : "is-placeholder"}" data-category="${escapeHtml(category)}">
          ${image}
          <span class="card-badge">${escapeHtml(category)}</span>
          <span class="card-number">${String(index + 1).padStart(3, "0")}</span>
          <span class="card-monogram" aria-hidden="true">${escapeHtml(initials)}</span>
          <span class="card-noimg" aria-hidden="true">Photo non disponible</span>
        </div>
        <div class="card-body">
          <div>
            <h3>${escapeHtml(breed.name)}</h3>
            <p>${escapeHtml(breed.country || "Origine inconnue")}</p>
          </div>
          <span class="card-arrow" aria-hidden="true">↗</span>
        </div>
      </button>
    </article>
  `;
}

function renderGrid(reset = true) {
  if (!filteredBreeds.length) {
    els.grid.innerHTML = "";
    els.grid.hidden = true;
    els.empty.hidden = false;
    els.loadMore.hidden = true;
    return;
  }

  els.grid.hidden = false;
  els.empty.hidden = true;

  if (reset) {
    els.grid.innerHTML = "";
  }

  const existing = reset ? 0 : els.grid.querySelectorAll(".card").length;
  const slice = filteredBreeds.slice(existing, state.visible);
  els.grid.insertAdjacentHTML(
    "beforeend",
    slice.map((breed, offset) => cardTemplate(breed, existing + offset)).join(""),
  );

  updateLoadMore();
}

function updateLoadMore() {
  const remaining = Math.max(0, filteredBreeds.length - state.visible);
  els.loadMore.hidden = remaining === 0;
  els.loadMoreCount.textContent = remaining > 0 ? `(${formatNumber(remaining)})` : "";
}

function updateResultMeta() {
  const count = filteredBreeds.length;
  els.resultCount.textContent = formatNumber(count);
  els.resultLabel.textContent = count > 1 || count === 0 ? "races" : "race";

  const filters = [];
  if (state.category !== "all") filters.push(CATEGORY_LABELS[state.category]);
  if (state.country) filters.push(state.country);
  if (state.query.trim()) filters.push(`« ${state.query.trim()} »`);
  els.resultFilter.textContent = filters.join(" · ");

  const hasFilters = state.category !== "all" || Boolean(state.country) || Boolean(state.query.trim());
  els.resetFilters.hidden = !hasFilters;
}

function applyFilters() {
  const query = normalize(state.query);
  filteredBreeds = breeds.filter((breed) => {
    if (state.category !== "all" && !breed.categories?.includes(state.category)) return false;
    if (state.country && breed.country !== state.country) return false;
    if (!query) return true;

    return [breed.name, breed.altName, breed.originalName, breed.country, breed.type, breed.usages]
      .some((value) => normalize(value).includes(query));
  });

  updateResultMeta();
  renderGrid(true);
}

function resetFilters() {
  state.query = "";
  state.category = "all";
  state.country = "";
  state.visible = BATCH_SIZE;

  els.search.value = "";
  els.country.value = "";
  els.searchClear.hidden = true;
  updateChips();
  applyFilters();
}

function selectFamily(category) {
  state.query = "";
  state.category = category;
  state.country = "";
  state.visible = BATCH_SIZE;

  els.search.value = "";
  els.country.value = "";
  els.searchClear.hidden = true;
  updateChips();
  applyFilters();
  scrollToCollection();
}

function makeDialogLink(href, label) {
  const link = document.createElement("a");
  link.className = "dialog-link";
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener";
  link.innerHTML = `${escapeHtml(label)} <span aria-hidden="true">↗</span>`;
  return link;
}

function openDialog(breed, trigger) {
  lastDialogTrigger = trigger || null;
  els.dialogMedia.classList.toggle("is-placeholder", !breed.image);
  els.dialogPlaceholder.textContent = getInitials(breed.name);

  if (breed.image) {
    els.dialogImage.src = breed.image;
    els.dialogImage.alt = `${breed.name}${breed.country ? `, ${breed.country}` : ""}`;
  } else {
    els.dialogImage.removeAttribute("src");
    els.dialogImage.alt = "";
  }

  els.dialogOrigin.textContent = [breed.country, breed.type].filter(Boolean).join(" · ");
  els.dialogName.textContent = breed.name;
  els.dialogAlt.textContent = breed.altName ? `Aussi appelé ${breed.altName}` : "";
  els.dialogAlt.hidden = !breed.altName;

  els.dialogTags.replaceChildren();
  (breed.categories?.length ? breed.categories : ["Autre"]).forEach((category) => {
    const tag = document.createElement("span");
    tag.className = "dialog-tag";
    tag.textContent = CATEGORY_LABELS[category] || category;
    els.dialogTags.append(tag);
  });

  const facts = [
    ["Origine", breed.country],
    ["Type", breed.type],
    ["Usages", breed.usages],
    ["Taille", breed.size],
    ["Effectif", breed.population],
    ["Nom d’origine", breed.originalName],
  ].filter(([, value]) => value && value !== "Non classé");

  els.dialogFacts.replaceChildren();
  facts.forEach(([label, value]) => {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value;
    row.append(term, description);
    els.dialogFacts.append(row);
  });
  els.dialogFacts.hidden = facts.length === 0;

  els.dialogLinks.replaceChildren();
  if (breed.wikipedia) {
    els.dialogLinks.append(makeDialogLink(breed.wikipedia, "Fiche Wikipédia"));
  }
  if (breed.image && breed.imagePage) {
    els.dialogLinks.append(makeDialogLink(breed.imagePage, "Voir la photo"));
  }

  if (breed.image) {
    const credit = breed.credit || "Wikimedia Commons";
    const creditHtml = breed.imagePage
      ? `<a href="${escapeHtml(breed.imagePage)}" target="_blank" rel="noopener">${escapeHtml(credit)}</a>`
      : escapeHtml(credit);
    const licenseHtml = breed.license
      ? ` — ${
          breed.licenseUrl
            ? `<a href="${escapeHtml(breed.licenseUrl)}" target="_blank" rel="noopener">${escapeHtml(breed.license)}</a>`
            : escapeHtml(breed.license)
        }`
      : "";
    els.dialogCredit.innerHTML = `Photo : ${creditHtml}${licenseHtml}`;
  } else {
    els.dialogCredit.textContent = "Photographie non disponible.";
  }

  if (els.dialog.open) {
    els.dialog.close();
  }
  els.dialog.showModal();
}

function setupDialog() {
  els.dialogClose.addEventListener("click", () => els.dialog.close());

  els.dialog.addEventListener("click", (event) => {
    const rect = els.dialog.getBoundingClientRect();
    const outside =
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom;
    if (outside) els.dialog.close();
  });

  els.dialog.addEventListener("close", () => {
    if (lastDialogTrigger) lastDialogTrigger.focus();
    lastDialogTrigger = null;
  });

  els.dialogImage.addEventListener("error", () => {
    if (els.dialogImage.getAttribute("src")) {
      els.dialogMedia.classList.add("is-placeholder");
    }
  });
}

function setupEvents() {
  els.search.addEventListener("input", (event) => {
    state.query = event.target.value;
    state.visible = BATCH_SIZE;
    els.searchClear.hidden = !state.query;
    applyFilters();
  });

  els.searchClear.addEventListener("click", () => {
    state.query = "";
    state.visible = BATCH_SIZE;
    els.search.value = "";
    els.searchClear.hidden = true;
    applyFilters();
    els.search.focus();
  });

  els.country.addEventListener("change", (event) => {
    state.country = event.target.value;
    state.visible = BATCH_SIZE;
    applyFilters();
  });

  els.chips.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-category]");
    if (!chip) return;
    state.category = chip.dataset.category;
    state.visible = BATCH_SIZE;
    updateChips();
    applyFilters();
  });

  els.grid.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-breed-index]");
    if (!trigger) return;
    const breed = filteredBreeds[Number(trigger.dataset.breedIndex)];
    if (breed) openDialog(breed, trigger);
  });

  els.loadMore.addEventListener("click", () => {
    state.visible += BATCH_SIZE;
    renderGrid(false);
  });

  els.resetFilters.addEventListener("click", resetFilters);
  els.emptyReset.addEventListener("click", () => {
    resetFilters();
    els.search.focus();
  });

  els.familyGrid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-family]");
    if (card) selectFamily(card.dataset.family);
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const typing =
      target instanceof HTMLElement &&
      (target.matches("input, textarea, select") || target.isContentEditable);

    if (event.key === "/" && !typing && !els.dialog.open) {
      event.preventDefault();
      els.search.focus();
    }
  });

  setupDialog();
}

async function init() {
  setupEvents();

  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    breeds = data.breeds || [];

    if (!breeds.length) throw new Error("Collection vide");

    setStats(data);
    renderHero();
    renderMarquee();
    renderChips();
    renderCountries(data.countries || []);
    renderFamilies();
    applyFilters();
    els.grid.setAttribute("aria-busy", "false");
  } catch (error) {
    console.error("Impossible de charger les races :", error);
    els.grid.setAttribute("aria-busy", "false");
    els.grid.hidden = true;
    els.empty.hidden = false;
    els.empty.querySelector(".empty-title").textContent = "La collection n’a pas pu être chargée";
    els.empty.querySelector("p:not(.empty-title)").textContent =
      "Rechargez la page pour réessayer.";
    els.emptyReset.hidden = true;
    els.loadMore.hidden = true;
  }
}

init();
