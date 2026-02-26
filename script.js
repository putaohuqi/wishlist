const STORAGE_KEY = "wishlist-items-v1";
const SEED_FLAG_KEY = "wishlist-seeded-cider-v2";
const COLOR_SAMPLE_SIZE = 24;

const accentCache = new Map();

const STARTER_ITEMS = [
  {
    id: "starter-cider-1",
    title: "Knit Two Tone Ruffle Trim Drawstring Knotted Cinched Waist Cardigan",
    url: "https://www.shopcider.com/goods/knit-colorblock-long-sleeve-ruffle-trim-knotted-cinched-waist-cardigan-114794624",
    image: "https://img1.shopcider.com/product/1753078093000-mZaDWe.jpg",
    category: "Fashion",
    priority: "medium",
    price: "",
    size: "",
    color: "Dark Navy",
    note: "",
    owned: false
  },
  {
    id: "starter-cider-2",
    title: "100% Cotton Peter Pan Collar Bowknot Pocket Button Oversized Blouse",
    url: "https://www.shopcider.com/goods/100-cotton-collar-ruched-oversized-short-sleeve-blouse-114769752",
    image: "https://img1.shopcider.com/product/1753760375000-nhjaBM.jpg",
    category: "Fashion",
    priority: "low",
    price: "",
    size: "",
    color: "White",
    note: "",
    owned: false
  }
];

const state = {
  items: loadItems(),
  filter: "all",
  query: "",
  view: "list",
  editingId: null,
  pendingDeleteId: null,
  draggingId: null
};

const refs = {
  form: document.getElementById("wish-form"),
  list: document.getElementById("wishlist"),
  template: document.getElementById("wish-template"),
  empty: document.getElementById("empty-state"),
  search: document.getElementById("search"),
  filters: Array.from(document.querySelectorAll("[data-filter]")),
  stats: document.getElementById("header-stats"),
  openAdd: document.getElementById("open-add"),
  closeAdd: document.getElementById("close-add"),
  modalBackdrop: document.getElementById("modal-backdrop"),
  modalTitle: document.getElementById("modal-title"),
  saveWishButton: document.getElementById("save-wish-btn"),
  confirmBackdrop: document.getElementById("confirm-backdrop"),
  confirmCancel: document.getElementById("confirm-cancel"),
  confirmDelete: document.getElementById("confirm-delete")
};

initialize();

function initialize() {
  refs.form.addEventListener("submit", handleSubmit);
  refs.list.addEventListener("click", handleListClick);
  refs.list.addEventListener("dragstart", handleCardDragStart);
  refs.list.addEventListener("dragover", handleCardDragOver);
  refs.list.addEventListener("drop", handleCardDrop);
  refs.list.addEventListener("dragend", handleCardDragEnd);
  refs.search.addEventListener("input", handleSearch);
  refs.filters.forEach((button) => button.addEventListener("click", handleFilterChange));
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

  seedStarterItemsOnce();
  backfillStarterPhotos();
  ensureItemOrder();

  setActiveFilterButton();
  applyViewClass();
  render();
}

function handleSubmit(event) {
  event.preventDefault();

  const formData = new FormData(refs.form);

  const title = getCleanValue(formData.get("title"));
  const urlValue = getCleanValue(formData.get("url"));
  const category = getCleanValue(formData.get("category"));
  const imageValue = getCleanValue(formData.get("image"));
  const priority = normalizePriority(formData.get("priority"));

  if (!title || !urlValue || !category) {
    return;
  }

  const parsedUrl = normalizeRequiredUrl(urlValue);
  if (!parsedUrl) {
    refs.form.querySelector("#url").focus();
    return;
  }

  const parsedImage = normalizeOptionalUrl(imageValue);
  if (parsedImage === null) {
    refs.form.querySelector("#image").focus();
    return;
  }

  const payload = {
    title,
    url: parsedUrl,
    image: parsedImage,
    category,
    priority,
    price: getCleanValue(formData.get("price")),
    size: getCleanValue(formData.get("size")),
    color: getCleanValue(formData.get("color")),
    note: getCleanValue(formData.get("note"))
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
    const frontOrder = getFrontOrder(state.items);
    state.items.unshift({
      id: createId(),
      owned: false,
      order: frontOrder,
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
  } else if (action === "toggle-owned") {
    state.items = state.items.map((item) => {
      if (item.id !== id) {
        return item;
      }
      return { ...item, owned: !item.owned };
    });
  } else {
    return;
  }

  persistItems(state.items);
  render();
}

function handleSearch(event) {
  state.query = getCleanValue(event.target.value).toLowerCase();
  render();
}

function handleCardDragStart(event) {
  const card = event.target.closest(".wish-card");
  if (!card || !card.draggable) {
    return;
  }

  state.draggingId = card.dataset.id;
  card.classList.add("is-dragging");

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", state.draggingId);
  }
}

function handleCardDragOver(event) {
  if (!state.draggingId) {
    return;
  }

  event.preventDefault();
  const targetCard = event.target.closest(".wish-card");

  clearDropTargets();
  if (targetCard && targetCard.dataset.id !== state.draggingId) {
    targetCard.classList.add("drop-target");
  }

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
}

function handleCardDrop(event) {
  if (!state.draggingId) {
    return;
  }

  event.preventDefault();
  const sourceId = state.draggingId;
  const targetCard = event.target.closest(".wish-card");
  clearDropTargets();

  if (!targetCard) {
    reorderVisibleItems(sourceId, null, false);
    cleanupDragState();
    return;
  }

  const targetId = targetCard.dataset.id;
  if (!targetId || targetId === sourceId) {
    cleanupDragState();
    return;
  }

  const rect = targetCard.getBoundingClientRect();
  const insertAfter = event.clientY > rect.top + rect.height / 2;
  reorderVisibleItems(sourceId, targetId, insertAfter);
  cleanupDragState();
}

function handleCardDragEnd() {
  cleanupDragState();
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
  refs.form.querySelector("#category").value = "Fashion";
  refs.form.querySelector("#priority").value = "medium";
  refs.modalTitle.textContent = "Add a wish";
  refs.saveWishButton.textContent = "Add to wishlist";
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
  refs.form.querySelector("#category").value = item.category || "Other";
  refs.form.querySelector("#image").value = item.image || "";
  refs.form.querySelector("#priority").value = normalizePriority(item.priority);
  refs.form.querySelector("#price").value = item.price || "";
  refs.form.querySelector("#size").value = item.size || "";
  refs.form.querySelector("#color").value = item.color || "";
  refs.form.querySelector("#note").value = item.note || "";

  refs.modalTitle.textContent = "Edit wish";
  refs.saveWishButton.textContent = "Save changes";
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

function handleConfirmBackdropClick(event) {
  if (event.target === refs.confirmBackdrop) {
    closeDeleteConfirm();
  }
}

function syncBodyModalState() {
  const anyOpen = !refs.modalBackdrop.hidden || !refs.confirmBackdrop.hidden;
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

function setActiveFilterButton() {
  refs.filters.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.filter === state.filter);
  });
}

function applyViewClass() {
  refs.list.classList.remove("view-grid");
  refs.list.classList.add("view-list");
}

function render() {
  const filtered = getVisibleItems(state.items, state.filter, state.query);
  const canDrag = filtered.length > 1;
  applyViewClass();

  refs.list.innerHTML = "";
  filtered.forEach((item) => {
    const card = refs.template.content.firstElementChild.cloneNode(true);
    card.dataset.id = item.id;
    card.draggable = canDrag;
    card.classList.toggle("is-draggable", canDrag);
    clearCardAccent(card);

    const photoLink = card.querySelector(".wish-photo-link");
    const photo = card.querySelector(".wish-photo");
    const titleLink = card.querySelector(".wish-title-link");
    if (item.image) {
      photo.src = item.image;
      photo.alt = item.title;
      photoLink.href = item.url;
      applyCardAccentFromImage(card, photo, item.image);
    } else {
      photoLink.remove();
    }

    titleLink.textContent = item.title;
    titleLink.href = item.url;

    card.querySelector(".wish-meta-text").textContent = buildMetaLine(item);

    const toggleOwned = card.querySelector("[data-action='toggle-owned']");
    toggleOwned.textContent = item.owned ? "Mark not bought" : "Mark bought";

    refs.list.append(card);
  });

  refs.empty.hidden = filtered.length !== 0;
  renderStats(state.items);
}

function buildMetaLine(item) {
  const pieces = [];

  if (item.price) {
    pieces.push(item.price);
  }
  if (item.color) {
    pieces.push(item.color);
  }
  if (item.size) {
    pieces.push(`Size ${item.size}`);
  }

  pieces.push(`${capitalize(item.priority)} priority`);
  return pieces.join(" · ");
}

function renderStats(items) {
  const total = items.length;
  const open = items.filter((item) => !item.owned).length;

  refs.stats.textContent = `${total} items • ${open} not bought`;
}

function getVisibleItems(items, filter, query) {
  return getOrderedItems(items)
    .filter((item) => {
      if (filter === "open") {
        return !item.owned;
      }
      if (filter === "owned") {
        return item.owned;
      }
      return true;
    })
    .filter((item) => {
      if (!query) {
        return true;
      }

      const haystack = `${item.title} ${item.category} ${item.price} ${item.priority} ${item.size} ${item.color} ${item.note}`.toLowerCase();
      return haystack.includes(query);
    });
}

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return STARTER_ITEMS.map((item) => ({ ...item }));
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return STARTER_ITEMS.map((item) => ({ ...item }));
    }

    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item, index) => ({
        id: String(item.id || createId()),
        title: String(item.title || "Untitled item"),
        url: String(item.url || "#"),
        image: String(item.image || ""),
        category: String(item.category || "Other"),
        priority: normalizePriority(item.priority),
        order: normalizeOrder(item.order, index),
        price: String(item.price || ""),
        size: String(item.size || ""),
        color: String(item.color || ""),
        note: String(item.note || ""),
        owned: Boolean(item.owned)
      }));
  } catch {
    return STARTER_ITEMS.map((item) => ({ ...item }));
  }
}

function persistItems(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function seedStarterItemsOnce() {
  if (localStorage.getItem(SEED_FLAG_KEY) === "true") {
    return;
  }

  const existingUrls = new Set(state.items.map((item) => normalizeUrl(item.url)));
  const missingItems = STARTER_ITEMS
    .filter((item) => !existingUrls.has(normalizeUrl(item.url)))
    .map((item) => ({ ...item }));

  if (missingItems.length > 0) {
    state.items = [...missingItems, ...state.items];
    persistItems(state.items);
  }

  localStorage.setItem(SEED_FLAG_KEY, "true");
}

function backfillStarterPhotos() {
  const photoByUrl = new Map(
    STARTER_ITEMS.filter((item) => item.image).map((item) => [normalizeUrl(item.url), item.image])
  );

  let changed = false;
  state.items = state.items.map((item) => {
    if (item.image) {
      return item;
    }

    const starterImage = photoByUrl.get(normalizeUrl(item.url));
    if (!starterImage) {
      return item;
    }

    changed = true;
    return { ...item, image: starterImage };
  });

  if (changed) {
    persistItems(state.items);
  }
}

function normalizePriority(value) {
  const clean = getCleanValue(value).toLowerCase();
  if (clean === "high" || clean === "low") {
    return clean;
  }
  return "medium";
}

function normalizeOrder(value, fallback) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return fallback;
}

function getOrderedItems(items) {
  return [...items].sort((a, b) => normalizeOrder(a.order, 0) - normalizeOrder(b.order, 0));
}

function ensureItemOrder() {
  const ordered = getOrderedItems(state.items);
  let changed = false;

  state.items = ordered.map((item, index) => {
    if (item.order !== index) {
      changed = true;
    }
    return { ...item, order: index };
  });

  if (changed) {
    persistItems(state.items);
  }
}

function getFrontOrder(items) {
  if (items.length === 0) {
    return 0;
  }
  let minOrder = normalizeOrder(items[0].order, 0);
  items.forEach((item) => {
    const nextOrder = normalizeOrder(item.order, 0);
    if (nextOrder < minOrder) {
      minOrder = nextOrder;
    }
  });
  return minOrder - 1;
}

function reorderVisibleItems(sourceId, targetId, insertAfter) {
  const visibleIds = getVisibleItems(state.items, state.filter, state.query).map((item) => item.id);
  if (!visibleIds.includes(sourceId)) {
    return;
  }

  const reorderedVisibleIds = visibleIds.filter((id) => id !== sourceId);
  if (targetId && reorderedVisibleIds.includes(targetId)) {
    let targetIndex = reorderedVisibleIds.indexOf(targetId);
    if (insertAfter) {
      targetIndex += 1;
    }
    reorderedVisibleIds.splice(targetIndex, 0, sourceId);
  } else {
    reorderedVisibleIds.push(sourceId);
  }

  applyVisibleOrderToAllItems(reorderedVisibleIds);
}

function applyVisibleOrderToAllItems(reorderedVisibleIds) {
  const ordered = getOrderedItems(state.items);
  const visibleSet = new Set(reorderedVisibleIds);
  const pointer = { value: 0 };

  const nextGlobalIds = ordered.map((item) => {
    if (!visibleSet.has(item.id)) {
      return item.id;
    }
    const nextId = reorderedVisibleIds[pointer.value];
    pointer.value += 1;
    return nextId;
  });

  const itemById = new Map(state.items.map((item) => [item.id, item]));
  state.items = nextGlobalIds.map((id, index) => {
    const base = itemById.get(id);
    return { ...base, order: index };
  });

  persistItems(state.items);
  render();
}

function clearDropTargets() {
  refs.list.querySelectorAll(".drop-target").forEach((card) => card.classList.remove("drop-target"));
}

function cleanupDragState() {
  state.draggingId = null;
  refs.list.querySelectorAll(".is-dragging").forEach((card) => card.classList.remove("is-dragging"));
  clearDropTargets();
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

function normalizeUrl(value) {
  try {
    return new URL(String(value || "").trim()).toString();
  } catch {
    return String(value || "").trim();
  }
}

function getCleanValue(value) {
  return String(value || "").trim();
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `wish-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function capitalize(value) {
  const clean = getCleanValue(value);
  if (!clean) {
    return "";
  }
  return clean[0].toUpperCase() + clean.slice(1);
}
