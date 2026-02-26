const STORAGE_KEY = "wishlist-items-v1";
const SEED_FLAG_KEY = "wishlist-seeded-cider-v2";

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

const priorityRank = {
  high: 0,
  medium: 1,
  low: 2
};

const state = {
  items: loadItems(),
  filter: "all",
  query: "",
  editingId: null,
  pendingDeleteId: null
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
  refs.search.addEventListener("input", handleSearch);
  refs.filters.forEach((button) => button.addEventListener("click", handleFilterChange));
  refs.openAdd.addEventListener("click", openAddModal);
  refs.closeAdd.addEventListener("click", closeModal);
  refs.modalBackdrop.addEventListener("click", handleModalBackdropClick);
  refs.confirmBackdrop.addEventListener("click", handleConfirmBackdropClick);
  refs.confirmCancel.addEventListener("click", closeDeleteConfirm);
  refs.confirmDelete.addEventListener("click", confirmDeleteItem);
  window.addEventListener("storage", handleStorageSync);
  document.addEventListener("keydown", handleGlobalKeydown);

  if (!localStorage.getItem(STORAGE_KEY)) {
    persistItems(state.items);
  }

  seedStarterItemsOnce();
  backfillStarterPhotos();

  setActiveFilterButton();
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
    state.items.unshift({
      id: createId(),
      owned: false,
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
  refs.modalBackdrop.hidden = false;
  syncBodyModalState();
}

function closeModal() {
  refs.modalBackdrop.hidden = true;
  state.editingId = null;
  syncBodyModalState();
}

function openDeleteConfirm(id) {
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

function render() {
  const filtered = getVisibleItems(state.items, state.filter, state.query);

  refs.list.innerHTML = "";
  filtered.forEach((item) => {
    const card = refs.template.content.firstElementChild.cloneNode(true);
    card.dataset.id = item.id;

    card.querySelector(".wish-category").textContent = item.category;

    const photoLink = card.querySelector(".wish-photo-link");
    const photo = card.querySelector(".wish-photo");
    const titleLink = card.querySelector(".wish-title-link");
    if (item.image) {
      photo.src = item.image;
      photo.alt = item.title;
      photoLink.href = item.url;
    } else {
      photoLink.remove();
    }

    titleLink.textContent = item.title;
    titleLink.href = item.url;

    card.querySelector(".wish-meta-text").textContent = buildMetaLine(item);

    const priorityTag = card.querySelector(".priority-tag");
    priorityTag.textContent = `${capitalize(item.priority)} priority`;
    priorityTag.classList.add(`priority-${item.priority}`);

    const toggleOwned = card.querySelector("[data-action='toggle-owned']");
    toggleOwned.textContent = item.owned ? "Mark not bought" : "Mark bought";

    refs.list.append(card);
  });

  refs.empty.hidden = filtered.length !== 0;
  renderStats(state.items);
}

function buildMetaLine(item) {
  const parts = [];

  if (item.price) {
    parts.push(item.price);
  }

  if (item.size) {
    parts.push(`Size ${item.size}`);
  }

  if (item.color) {
    parts.push(item.color);
  }

  if (item.note) {
    parts.push(item.note);
  }

  if (parts.length === 0) {
    return "No extra details";
  }

  return parts.join(" • ");
}

function renderStats(items) {
  const total = items.length;
  const open = items.filter((item) => !item.owned).length;

  refs.stats.textContent = `${total} items • ${open} not bought`;
}

function getVisibleItems(items, filter, query) {
  return items
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
    })
    .sort((a, b) => {
      if (a.owned !== b.owned) {
        return Number(a.owned) - Number(b.owned);
      }
      if (a.priority !== b.priority) {
        return priorityRank[a.priority] - priorityRank[b.priority];
      }
      return a.title.localeCompare(b.title);
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
      .map((item) => ({
        id: String(item.id || createId()),
        title: String(item.title || "Untitled item"),
        url: String(item.url || "#"),
        image: String(item.image || ""),
        category: String(item.category || "Other"),
        priority: normalizePriority(item.priority),
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
