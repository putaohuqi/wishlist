const STORAGE_KEY = "manhwa-items-v1";
const CLOUD_LIST_ID = "manhwa";
const COLOR_SAMPLE_SIZE = 24;
const MAX_UPLOAD_BYTES = 1200 * 1024;
const STATUSES = ["reading", "paused", "completed"];
const SERIES_TYPES = ["manhwa", "manga", "manhua"];
const SERIES_GENRES = ["bl", "isekai-romance", "modern", "action"];
const STATUS_LABELS = {
  reading: "Reading",
  paused: "Paused",
  completed: "Completed"
};
const TYPE_LABELS = {
  manhwa: "manhwa",
  manga: "manga",
  manhua: "manhua"
};
const GENRE_LABELS = {
  bl: "BL",
  "isekai-romance": "isekai/romance",
  modern: "modern",
  action: "action"
};

const accentCache = new Map();

const state = {
  items: loadItems(),
  filter: "all",
  typeFilter: "all",
  genreFilter: "all",
  query: "",
  editingId: null,
  pendingDeleteId: null
};

const refs = {
  form: document.getElementById("manhwa-form"),
  listsWrap: document.getElementById("manhwa-lists"),
  ongoingSection: document.getElementById("ongoing-section"),
  completedSection: document.getElementById("completed-section"),
  ongoingList: document.getElementById("ongoing-list"),
  completedList: document.getElementById("completed-list"),
  ongoingEmpty: document.getElementById("ongoing-empty"),
  completedEmpty: document.getElementById("completed-empty"),
  ongoingCount: document.getElementById("ongoing-count"),
  completedCount: document.getElementById("completed-count"),
  template: document.getElementById("manhwa-template"),
  empty: document.getElementById("empty-state"),
  search: document.getElementById("search"),
  coverInput: document.getElementById("cover"),
  coverDataInput: document.getElementById("cover-data"),
  coverFileInput: document.getElementById("cover-file"),
  coverUploadButton: document.getElementById("cover-upload-btn"),
  coverUploadClear: document.getElementById("cover-upload-clear"),
  coverUploadStatus: document.getElementById("cover-upload-status"),
  filters: Array.from(document.querySelectorAll("[data-filter]")),
  typeFilters: Array.from(document.querySelectorAll("[data-type-filter]")),
  genreFilters: Array.from(document.querySelectorAll("[data-genre-filter]")),
  stats: document.getElementById("header-stats"),
  openAdd: document.getElementById("open-add"),
  closeAdd: document.getElementById("close-add"),
  modalBackdrop: document.getElementById("modal-backdrop"),
  modalTitle: document.getElementById("modal-title"),
  saveSeriesButton: document.getElementById("save-series-btn"),
  confirmBackdrop: document.getElementById("confirm-backdrop"),
  confirmCancel: document.getElementById("confirm-cancel"),
  confirmDelete: document.getElementById("confirm-delete")
};

initialize();

function initialize() {
  refs.form.addEventListener("submit", handleSubmit);
  refs.listsWrap.addEventListener("click", handleListClick);
  refs.search.addEventListener("input", handleSearch);
  refs.coverInput.addEventListener("input", handleCoverInputChange);
  refs.coverUploadButton.addEventListener("click", handleCoverUploadClick);
  refs.coverFileInput.addEventListener("change", handleCoverFileChange);
  refs.coverUploadClear.addEventListener("click", clearUploadedCover);
  refs.filters.forEach((button) => button.addEventListener("click", handleFilterChange));
  refs.typeFilters.forEach((button) => button.addEventListener("click", handleTypeFilterChange));
  refs.genreFilters.forEach((button) => button.addEventListener("click", handleGenreFilterChange));
  refs.openAdd.addEventListener("click", openAddModal);
  refs.closeAdd.addEventListener("click", closeModal);
  refs.modalBackdrop.addEventListener("click", handleModalBackdropClick);
  refs.confirmBackdrop.addEventListener("click", handleConfirmBackdropClick);
  refs.confirmCancel.addEventListener("click", closeDeleteConfirm);
  refs.confirmDelete.addEventListener("click", confirmDeleteItem);
  window.addEventListener("storage", handleStorageSync);
  window.addEventListener("pageshow", resetOverlayState);
  document.addEventListener("keydown", handleGlobalKeydown);

  resetOverlayState();

  if (!localStorage.getItem(STORAGE_KEY)) {
    persistItems(state.items);
  }

  initializeCloudSync();
  setActiveFilterButton();
  setActiveTypeFilterButton();
  setActiveGenreFilterButton();
  resetCoverInputs();
  render();
}

function initializeCloudSync() {
  const cloud = window.WishlistCloud;
  if (!cloud) {
    return;
  }

  cloud.noteLocalChange(STORAGE_KEY, getLatestUpdate(state.items));

  let syncTimerId = 0;

  const runSync = async () => {
    if (!cloud.getCurrentUser()) {
      return;
    }

    try {
      const syncedItems = await cloud.syncList(CLOUD_LIST_ID, STORAGE_KEY, state.items);
      if (JSON.stringify(syncedItems) === JSON.stringify(state.items)) {
        return;
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(syncedItems));
      state.items = loadItems();
      render();
    } catch (error) {
      console.error("Cloud sync failed for manhwa tracker:", error);
    }
  };

  cloud.onAuthChange(async (user) => {
    if (syncTimerId) {
      window.clearInterval(syncTimerId);
      syncTimerId = 0;
    }

    if (!user) {
      return;
    }

    await runSync();
    syncTimerId = window.setInterval(runSync, 12000);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      runSync();
    }
  });
}

function handleSubmit(event) {
  event.preventDefault();

  const formData = new FormData(refs.form);
  const title = getCleanValue(formData.get("title"));
  const urlValue = getCleanValue(formData.get("url"));
  const coverValue = getCleanValue(formData.get("cover"));
  const coverDataValue = getCleanValue(formData.get("coverData"));
  const seriesType = normalizeSeriesType(formData.get("seriesType"));
  const genre = normalizeGenre(formData.get("genre"));
  const chapter = getCleanValue(formData.get("chapter"));
  const status = normalizeStatus(formData.get("status"));
  const rating = normalizeRating(formData.get("rating"));
  const note = getCleanValue(formData.get("note"));

  if (!title || !urlValue) {
    return;
  }

  const parsedUrl = normalizeRequiredUrl(urlValue);
  if (!parsedUrl) {
    refs.form.querySelector("#url").focus();
    return;
  }

  const parsedCover = normalizeCoverValue(coverDataValue || coverValue);
  if (parsedCover === null) {
    refs.form.querySelector("#cover").focus();
    return;
  }

  const payload = {
    title,
    url: parsedUrl,
    cover: parsedCover,
    seriesType,
    genre,
    chapter,
    status,
    rating,
    note,
    _updatedAt: Date.now()
  };

  if (state.editingId) {
    state.items = state.items.map((item) => {
      if (item.id !== state.editingId) {
        return item;
      }
      return {
        ...item,
        ...payload
      };
    });
  } else {
    const now = Date.now();
    state.items.unshift({
      id: createId(),
      createdAt: now,
      _updatedAt: now,
      ...payload
    });
  }

  persistItems(state.items);
  render();
  closeModal();
}

function handleListClick(event) {
  const actionButton = event.target.closest("button[data-action]");
  if (!actionButton) {
    return;
  }

  const card = actionButton.closest(".wish-card");
  if (!card) {
    return;
  }

  const id = card.dataset.id;
  const action = actionButton.dataset.action;
  closeCardMenu(actionButton);

  if (action === "edit-item") {
    openEditModal(id);
    return;
  }

  if (action === "delete") {
    openDeleteConfirm(id);
    return;
  }

  if (action === "cycle-status") {
    const now = Date.now();
    state.items = state.items.map((item) => {
      if (item.id !== id) {
        return item;
      }
      return {
        ...item,
        status: nextStatus(item.status),
        _updatedAt: now
      };
    });
    persistItems(state.items);
    render();
  }
}

function handleSearch(event) {
  state.query = getCleanValue(event.target.value).toLowerCase();
  render();
}

function handleCoverInputChange(event) {
  const nextValue = getCleanValue(event.target.value);
  if (nextValue) {
    refs.coverDataInput.value = "";
    refs.coverFileInput.value = "";
    refs.coverUploadClear.hidden = true;
    setCoverUploadStatus("using cover link", "muted");
    return;
  }

  if (!refs.coverDataInput.value) {
    setCoverUploadStatus("or paste a cover image link above", "muted");
  }
}

function handleCoverUploadClick() {
  refs.coverFileInput.click();
}

async function handleCoverFileChange(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    setCoverUploadStatus("please choose an image file", "error");
    refs.coverFileInput.value = "";
    return;
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    setCoverUploadStatus("image is too large (max 1.2MB)", "error");
    refs.coverFileInput.value = "";
    return;
  }

  try {
    const coverData = await readFileAsDataUrl(file);
    refs.coverDataInput.value = coverData;
    refs.coverInput.value = "";
    refs.coverUploadClear.hidden = false;
    setCoverUploadStatus(`uploaded: ${file.name}`, "success");
  } catch {
    setCoverUploadStatus("could not read this image file", "error");
  } finally {
    refs.coverFileInput.value = "";
  }
}

function clearUploadedCover() {
  refs.coverDataInput.value = "";
  refs.coverFileInput.value = "";
  refs.coverUploadClear.hidden = true;

  if (getCleanValue(refs.coverInput.value)) {
    setCoverUploadStatus("using cover link", "muted");
    return;
  }

  setCoverUploadStatus("or paste a cover image link above", "muted");
}

function handleFilterChange(event) {
  const nextFilter = event.currentTarget.dataset.filter;
  if (!nextFilter) {
    return;
  }

  state.filter = nextFilter;
  setActiveFilterButton();
  render();
}

function handleTypeFilterChange(event) {
  const nextFilter = event.currentTarget.dataset.typeFilter;
  if (!nextFilter) {
    return;
  }

  state.typeFilter = nextFilter;
  setActiveTypeFilterButton();
  render();
}

function handleGenreFilterChange(event) {
  const nextFilter = event.currentTarget.dataset.genreFilter;
  if (!nextFilter) {
    return;
  }

  state.genreFilter = nextFilter;
  setActiveGenreFilterButton();
  render();
}

function handleStorageSync(event) {
  if (event.key !== STORAGE_KEY) {
    return;
  }
  state.items = loadItems();
  render();
}

function handleModalBackdropClick(event) {
  if (event.target === refs.modalBackdrop) {
    closeModal();
  }
}

function handleConfirmBackdropClick(event) {
  if (event.target === refs.confirmBackdrop) {
    closeDeleteConfirm();
  }
}

function handleGlobalKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }

  if (!refs.confirmBackdrop.hidden) {
    closeDeleteConfirm();
    return;
  }

  if (!refs.modalBackdrop.hidden) {
    closeModal();
  }
}

function openAddModal() {
  state.editingId = null;
  refs.form.reset();
  resetCoverInputs();
  refs.form.querySelector("#series-type").value = "manhwa";
  refs.form.querySelector("#series-genre").value = "isekai-romance";
  refs.form.querySelector("#status").value = "reading";
  refs.form.querySelector("#rating").value = "";
  refs.modalTitle.textContent = "Add a manhwa";
  refs.saveSeriesButton.textContent = "Save to tracker";
  openModal();
  refs.form.querySelector("#title").focus();
}

function openEditModal(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) {
    return;
  }

  state.editingId = id;
  refs.form.querySelector("#title").value = item.title;
  refs.form.querySelector("#url").value = item.url;
  populateCoverInputs(item.cover || "");
  refs.form.querySelector("#series-type").value = normalizeSeriesType(item.seriesType);
  refs.form.querySelector("#series-genre").value = normalizeGenre(item.genre);
  refs.form.querySelector("#chapter").value = item.chapter || "";
  refs.form.querySelector("#status").value = normalizeStatus(item.status);
  refs.form.querySelector("#rating").value = normalizeRating(item.rating);
  refs.form.querySelector("#note").value = item.note || "";

  refs.modalTitle.textContent = "Edit series";
  refs.saveSeriesButton.textContent = "Save changes";
  openModal();
  refs.form.querySelector("#title").focus();
}

function openModal() {
  refs.confirmBackdrop.hidden = true;
  state.pendingDeleteId = null;
  refs.modalBackdrop.hidden = false;
  syncBodyModalState();
}

function closeModal() {
  refs.modalBackdrop.hidden = true;
  state.editingId = null;
  syncBodyModalState();
}

function openDeleteConfirm(id) {
  refs.modalBackdrop.hidden = true;
  state.editingId = null;
  state.pendingDeleteId = id;
  refs.confirmBackdrop.hidden = false;
  syncBodyModalState();
}

function closeDeleteConfirm() {
  refs.confirmBackdrop.hidden = true;
  state.pendingDeleteId = null;
  syncBodyModalState();
}

function confirmDeleteItem() {
  if (!state.pendingDeleteId) {
    closeDeleteConfirm();
    return;
  }

  state.items = state.items.filter((item) => item.id !== state.pendingDeleteId);
  persistItems(state.items);
  render();
  closeDeleteConfirm();
}

function syncBodyModalState() {
  const authBackdrop = document.getElementById("auth-backdrop");
  const anyOpen =
    !refs.modalBackdrop.hidden ||
    !refs.confirmBackdrop.hidden ||
    Boolean(authBackdrop && !authBackdrop.hidden);
  document.body.classList.toggle("modal-open", anyOpen);
}

function resetOverlayState() {
  refs.modalBackdrop.hidden = true;
  refs.confirmBackdrop.hidden = true;
  state.editingId = null;
  state.pendingDeleteId = null;
  syncBodyModalState();
}

function closeCardMenu(actionButton) {
  const menu = actionButton.closest(".card-menu");
  if (menu) {
    menu.open = false;
  }
}

function resetCoverInputs() {
  refs.coverInput.value = "";
  refs.coverDataInput.value = "";
  refs.coverFileInput.value = "";
  refs.coverUploadClear.hidden = true;
  setCoverUploadStatus("or paste a cover image link above", "muted");
}

function populateCoverInputs(coverValue) {
  resetCoverInputs();
  const cover = getCleanValue(coverValue);
  if (!cover) {
    return;
  }

  if (isDataImageUrl(cover)) {
    refs.coverDataInput.value = cover;
    refs.coverUploadClear.hidden = false;
    setCoverUploadStatus("using uploaded cover from device", "success");
    return;
  }

  refs.coverInput.value = cover;
  setCoverUploadStatus("using cover link", "muted");
}

function setCoverUploadStatus(message, stateName) {
  refs.coverUploadStatus.textContent = message;
  refs.coverUploadStatus.classList.remove("is-muted", "is-success", "is-error");
  refs.coverUploadStatus.classList.add(`is-${stateName}`);
}

function setActiveFilterButton() {
  refs.filters.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.filter === state.filter);
  });
}

function setActiveTypeFilterButton() {
  refs.typeFilters.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.typeFilter === state.typeFilter);
  });
}

function setActiveGenreFilterButton() {
  refs.genreFilters.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.genreFilter === state.genreFilter);
  });
}

function render() {
  const visibleItems = getVisibleItems(state.items, state.filter, state.typeFilter, state.genreFilter, state.query);
  const ongoingItems = visibleItems.filter((item) => normalizeStatus(item.status) !== "completed");
  const completedItems = visibleItems.filter((item) => normalizeStatus(item.status) === "completed");

  refs.ongoingCount.textContent = `${ongoingItems.length} series`;
  refs.completedCount.textContent = `${completedItems.length} series`;

  refs.empty.hidden = visibleItems.length !== 0;
  if (visibleItems.length === 0) {
    refs.ongoingSection.hidden = true;
    refs.completedSection.hidden = true;
    refs.ongoingList.innerHTML = "";
    refs.completedList.innerHTML = "";
    refs.ongoingEmpty.hidden = true;
    refs.completedEmpty.hidden = true;
    renderStats(state.items);
    return;
  }

  const showOngoing = state.filter !== "completed";
  const showCompleted = state.filter !== "reading" && state.filter !== "paused";

  refs.ongoingSection.hidden = !showOngoing;
  refs.completedSection.hidden = !showCompleted;

  renderSection(refs.ongoingList, refs.ongoingEmpty, ongoingItems, showOngoing);
  renderSection(refs.completedList, refs.completedEmpty, completedItems, showCompleted);

  renderStats(state.items);
}

function renderSection(listEl, emptyEl, items, visible) {
  if (!visible) {
    listEl.innerHTML = "";
    emptyEl.hidden = true;
    return;
  }

  listEl.innerHTML = "";
  items.forEach((item) => {
    listEl.append(createSeriesCard(item));
  });

  emptyEl.hidden = items.length !== 0;
}

function createSeriesCard(item) {
  const card = refs.template.content.firstElementChild.cloneNode(true);
  card.dataset.id = item.id;
  clearCardAccent(card);

  const statusPill = card.querySelector(".series-status");
  statusPill.textContent = STATUS_LABELS[normalizeStatus(item.status)];
  statusPill.classList.add(`status-${normalizeStatus(item.status)}`);

  const photoLink = card.querySelector(".wish-photo-link");
  const photo = card.querySelector(".wish-photo");
  if (item.cover) {
    photo.addEventListener(
      "error",
      () => {
        setPlaceholderCover(photo, photoLink, item.title);
      },
      { once: true }
    );
    photo.src = item.cover;
    photo.alt = `${item.title} cover`;
    photoLink.href = item.url;
    photoLink.classList.remove("is-placeholder");
    applyCardAccentFromImage(card, photo, item.cover);
  } else {
    setPlaceholderCover(photo, photoLink, item.title);
    photoLink.href = item.url;
  }

  const titleLink = card.querySelector(".wish-title-link");
  titleLink.textContent = item.title;
  titleLink.href = item.url;

  card.querySelector(".wish-meta-text").textContent = buildMetaLine(item);

  const note = card.querySelector(".series-note");
  if (item.note) {
    note.hidden = false;
    note.textContent = item.note;
  } else {
    note.hidden = true;
    note.textContent = "";
  }

  const cycleButton = card.querySelector("[data-action='cycle-status']");
  cycleButton.textContent = `Set ${STATUS_LABELS[nextStatus(item.status)].toLowerCase()}`;

  return card;
}

function buildMetaLine(item) {
  const parts = [];
  if (item.chapter) {
    parts.push(`Ch. ${item.chapter}`);
  }
  parts.push(TYPE_LABELS[normalizeSeriesType(item.seriesType)]);
  parts.push(GENRE_LABELS[normalizeGenre(item.genre)]);
  parts.push(STATUS_LABELS[normalizeStatus(item.status)]);
  if (item.rating) {
    parts.push(`${item.rating}/10`);
  }
  return parts.join(" · ");
}

function renderStats(items) {
  const total = items.length;
  const reading = items.filter((item) => normalizeStatus(item.status) === "reading").length;
  refs.stats.textContent = `${total} series • ${reading} reading`;
}

function getVisibleItems(items, filter, typeFilter, genreFilter, query) {
  return [...items]
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .filter((item) => {
      if (filter === "all") {
        return true;
      }
      return normalizeStatus(item.status) === filter;
    })
    .filter((item) => {
      if (typeFilter === "all") {
        return true;
      }
      return normalizeSeriesType(item.seriesType) === typeFilter;
    })
    .filter((item) => {
      if (genreFilter === "all") {
        return true;
      }
      return normalizeGenre(item.genre) === genreFilter;
    })
    .filter((item) => {
      if (!query) {
        return true;
      }
      const haystack =
        `${item.title} ${item.chapter} ${item.status} ${item.rating} ${item.note} ${item.seriesType} ${item.genre}`.toLowerCase();
      return haystack.includes(query);
    });
}

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: String(item.id || createId()),
        createdAt: normalizeTimestamp(item.createdAt, Date.now()),
        _updatedAt: normalizeTimestamp(item._updatedAt || item.updatedAt || item.createdAt, Date.now()),
        title: String(item.title || "Untitled"),
        url: String(item.url || "#"),
        cover: String(item.cover || ""),
        seriesType: normalizeSeriesType(item.seriesType),
        genre: normalizeGenre(item.genre),
        chapter: String(item.chapter || ""),
        status: normalizeStatus(item.status),
        rating: normalizeRating(item.rating),
        note: String(item.note || "")
      }));
  } catch {
    return [];
  }
}

function persistItems(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));

  const cloud = window.WishlistCloud;
  if (!cloud) {
    return;
  }

  const updatedAt = getLatestUpdate(items);
  cloud.noteLocalChange(STORAGE_KEY, updatedAt);
  cloud.saveList(CLOUD_LIST_ID, STORAGE_KEY, items);
}

function normalizeTimestamp(value, fallback) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

function normalizeRequiredUrl(value) {
  const clean = getCleanValue(value);
  if (!clean) {
    return "";
  }

  try {
    return new URL(clean).toString();
  } catch {
    return "";
  }
}

function normalizeOptionalUrl(value) {
  const clean = getCleanValue(value);
  if (!clean) {
    return "";
  }

  try {
    return new URL(clean).toString();
  } catch {
    return null;
  }
}

function normalizeCoverValue(value) {
  const clean = getCleanValue(value);
  if (!clean) {
    return "";
  }

  if (isDataImageUrl(clean)) {
    return clean;
  }

  return normalizeOptionalUrl(clean);
}

function normalizeUrl(value) {
  try {
    return new URL(String(value || "").trim()).toString();
  } catch {
    return String(value || "").trim();
  }
}

function normalizeStatus(value) {
  const clean = getCleanValue(value).toLowerCase();
  if (STATUSES.includes(clean)) {
    return clean;
  }
  return "reading";
}

function normalizeSeriesType(value) {
  const clean = getCleanValue(value).toLowerCase();
  if (SERIES_TYPES.includes(clean)) {
    return clean;
  }
  return "manhwa";
}

function normalizeGenre(value) {
  const clean = getCleanValue(value).toLowerCase();
  if (SERIES_GENRES.includes(clean)) {
    return clean;
  }
  return "isekai-romance";
}

function normalizeRating(value) {
  const clean = getCleanValue(value);
  if (!clean) {
    return "";
  }

  const numeric = Number(clean);
  if (!Number.isFinite(numeric)) {
    return "";
  }

  const rounded = Math.round(numeric);
  if (rounded < 1 || rounded > 10) {
    return "";
  }
  return String(rounded);
}

function getLatestUpdate(items) {
  if (!items.length) {
    return Date.now();
  }

  return items.reduce((latest, item) => {
    const nextValue = normalizeTimestamp(item._updatedAt || item.createdAt, 0);
    return nextValue > latest ? nextValue : latest;
  }, 0);
}

function nextStatus(currentStatus) {
  const currentIndex = STATUSES.indexOf(normalizeStatus(currentStatus));
  return STATUSES[(currentIndex + 1) % STATUSES.length];
}

function getCleanValue(value) {
  return String(value || "").trim();
}

function isDataImageUrl(value) {
  return getCleanValue(value).toLowerCase().startsWith("data:image/");
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `series-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createCoverPlaceholder(title) {
  const firstLetter = getCleanValue(title).charAt(0).toUpperCase() || "?";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#e5f3fd" />
          <stop offset="100%" stop-color="#d1e5f4" />
        </linearGradient>
      </defs>
      <rect width="200" height="200" fill="url(#g)" />
      <text x="100" y="118" text-anchor="middle" fill="#7b7b85" font-family="Nunito, sans-serif" font-size="84" font-weight="700">${firstLetter}</text>
    </svg>
  `;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function setPlaceholderCover(photo, photoLink, title) {
  photo.src = createCoverPlaceholder(title);
  photo.alt = `${title} cover placeholder`;
  photoLink.classList.add("is-placeholder");
}

function applyCardAccentFromImage(card, photo, imageUrl) {
  const cacheKey = normalizeUrl(imageUrl);
  const cachedAccent = accentCache.get(cacheKey);
  if (cachedAccent) {
    setCardAccent(card, cachedAccent);
    return;
  }

  const assignAccent = () => {
    const accent = extractDominantAccent(photo);
    if (!accent) {
      return;
    }

    accentCache.set(cacheKey, accent);
    if (card.isConnected) {
      setCardAccent(card, accent);
    }
  };

  if (photo.complete && photo.naturalWidth > 0) {
    assignAccent();
    return;
  }

  photo.addEventListener("load", assignAccent, { once: true });
}

function setCardAccent(card, accentRgb) {
  card.style.setProperty("--card-accent-rgb", accentRgb);
  card.classList.add("has-accent");
}

function clearCardAccent(card) {
  card.style.removeProperty("--card-accent-rgb");
  card.classList.remove("has-accent");
}

function extractDominantAccent(photo) {
  if (!photo.naturalWidth || !photo.naturalHeight) {
    return "";
  }

  const canvas = document.createElement("canvas");
  canvas.width = COLOR_SAMPLE_SIZE;
  canvas.height = COLOR_SAMPLE_SIZE;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return "";
  }

  try {
    context.drawImage(photo, 0, 0, COLOR_SAMPLE_SIZE, COLOR_SAMPLE_SIZE);
  } catch {
    return "";
  }

  let pixelData;
  try {
    pixelData = context.getImageData(0, 0, COLOR_SAMPLE_SIZE, COLOR_SAMPLE_SIZE).data;
  } catch {
    return "";
  }

  let redTotal = 0;
  let greenTotal = 0;
  let blueTotal = 0;
  let weightTotal = 0;

  for (let index = 0; index < pixelData.length; index += 4) {
    const red = pixelData[index];
    const green = pixelData[index + 1];
    const blue = pixelData[index + 2];
    const alpha = pixelData[index + 3] / 255;

    if (alpha < 0.45) {
      continue;
    }

    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const saturation = max === 0 ? 0 : (max - min) / max;
    const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;

    if (luminance > 0.95 || luminance < 0.08) {
      continue;
    }

    const weight = (0.25 + saturation * 0.75) * alpha;
    redTotal += red * weight;
    greenTotal += green * weight;
    blueTotal += blue * weight;
    weightTotal += weight;
  }

  if (weightTotal < 1) {
    return "";
  }

  const softened = softenAccentColor({
    red: Math.round(redTotal / weightTotal),
    green: Math.round(greenTotal / weightTotal),
    blue: Math.round(blueTotal / weightTotal)
  });

  return `${softened.red} ${softened.green} ${softened.blue}`;
}

function softenAccentColor(color) {
  const blend = 0.2;
  return {
    red: blendChannel(color.red, 255, blend),
    green: blendChannel(color.green, 255, blend),
    blue: blendChannel(color.blue, 255, blend)
  };
}

function blendChannel(source, target, amount) {
  return Math.round(source * (1 - amount) + target * amount);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}
