const STORAGE_KEY = "wishlist-items-v1";
const SEED_FLAG_KEY = "wishlist-seeded-cider-v1";

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
  query: ""
};

const refs = {
  form: document.getElementById("wish-form"),
  list: document.getElementById("wishlist"),
  template: document.getElementById("wish-template"),
  empty: document.getElementById("empty-state"),
  search: document.getElementById("search"),
  filters: Array.from(document.querySelectorAll("[data-filter]")),
  total: document.getElementById("count-total"),
  open: document.getElementById("count-open"),
  owned: document.getElementById("count-owned")
};

initialize();

function initialize() {
  refs.form.addEventListener("submit", handleSubmit);
  refs.list.addEventListener("click", handleListClick);
  refs.search.addEventListener("input", handleSearch);
  refs.filters.forEach((button) => button.addEventListener("click", handleFilterChange));
  window.addEventListener("storage", handleStorageSync);

  if (!localStorage.getItem(STORAGE_KEY)) {
    persistItems(state.items);
  }
  seedStarterItemsOnce();
  backfillStarterPhotos();

  requestAnimationFrame(() => {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
  });

  render();
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

function handleSubmit(event) {
  event.preventDefault();

  const formData = new FormData(refs.form);
  const title = getCleanValue(formData.get("title"));
  const urlValue = getCleanValue(formData.get("url"));
  const imageValue = getCleanValue(formData.get("image"));

  if (!title || !urlValue) {
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(urlValue);
  } catch {
    refs.form.querySelector("#url").focus();
    return;
  }

  let parsedImageUrl = "";
  if (imageValue) {
    try {
      parsedImageUrl = new URL(imageValue).toString();
    } catch {
      refs.form.querySelector("#image").focus();
      return;
    }
  }

  const item = {
    id: createId(),
    title,
    url: parsedUrl.toString(),
    image: parsedImageUrl,
    category: getCleanValue(formData.get("category")) || "Other",
    priority: normalizePriority(getCleanValue(formData.get("priority"))),
    price: getCleanValue(formData.get("price")),
    size: getCleanValue(formData.get("size")),
    color: getCleanValue(formData.get("color")),
    note: getCleanValue(formData.get("note")),
    owned: false
  };

  state.items.unshift(item);
  persistItems(state.items);
  refs.form.reset();
  refs.form.querySelector("#priority").value = "medium";
  refs.form.querySelector("#title").focus();
  render();
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
  let didChange = false;

  if (action === "delete") {
    if (!window.confirm("Delete this wish?")) {
      return;
    }
    state.items = state.items.filter((item) => item.id !== id);
    didChange = true;
  } else if (action === "edit-item") {
    didChange = editItemById(id);
  } else if (action === "toggle-owned") {
    state.items = state.items.map((item) => {
      if (item.id !== id) {
        return item;
      }
      return { ...item, owned: !item.owned };
    });
    didChange = true;
  }

  if (!didChange) {
    return;
  }

  persistItems(state.items);
  render();
}

function handleFilterChange(event) {
  const nextFilter = event.currentTarget.dataset.filter;
  if (!nextFilter) {
    return;
  }

  state.filter = nextFilter;
  refs.filters.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.filter === nextFilter);
  });
  render();
}

function handleSearch(event) {
  state.query = getCleanValue(event.target.value).toLowerCase();
  render();
}

function handleStorageSync(event) {
  if (event.key !== STORAGE_KEY) {
    return;
  }
  state.items = loadItems();
  render();
}

function render() {
  const filtered = getVisibleItems(state.items, state.filter, state.query);

  refs.list.innerHTML = "";
  filtered.forEach((item) => {
    const card = refs.template.content.firstElementChild.cloneNode(true);

    card.dataset.id = item.id;
    card.classList.add(`priority-${item.priority}`);
    card.classList.toggle("owned", item.owned);

    card.querySelector(".wish-category").textContent = item.category;
    card.querySelector(".wish-title").textContent = item.title;

    const photoLinkEl = card.querySelector(".wish-photo-link");
    const photoEl = card.querySelector(".wish-photo");
    if (item.image) {
      photoLinkEl.href = item.url;
      photoEl.src = item.image;
      photoEl.alt = item.title;
    } else {
      photoLinkEl.remove();
    }

    const noteEl = card.querySelector(".wish-note");
    if (item.note) {
      noteEl.textContent = item.note;
    } else {
      noteEl.remove();
    }

    const priceEl = card.querySelector(".wish-price");
    if (item.price) {
      priceEl.textContent = item.price;
    } else {
      priceEl.remove();
    }

    const sizeEl = card.querySelector(".wish-size");
    if (item.size) {
      sizeEl.textContent = `Size: ${item.size}`;
    } else {
      sizeEl.remove();
    }

    const colorEl = card.querySelector(".wish-color");
    if (item.color) {
      colorEl.textContent = `Color: ${item.color}`;
    } else {
      colorEl.remove();
    }

    const priorityEl = card.querySelector(".wish-priority");
    priorityEl.textContent = `${capitalize(item.priority)} priority`;
    priorityEl.classList.add(`priority-${item.priority}`);

    const link = card.querySelector(".link-btn");
    link.href = item.url;

    const toggleOwned = card.querySelector("[data-action='toggle-owned']");
    toggleOwned.textContent = item.owned ? "Mark as not bought" : "Mark as bought";

    refs.list.append(card);
  });

  refs.empty.hidden = filtered.length !== 0;
  renderStats(state.items);
}

function renderStats(items) {
  const total = items.length;
  const owned = items.filter((item) => item.owned).length;
  const open = total - owned;

  refs.total.textContent = String(total);
  refs.open.textContent = String(open);
  refs.owned.textContent = String(owned);
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
      const haystack = `${item.title} ${item.category} ${item.size} ${item.color} ${item.note}`.toLowerCase();
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
        priority: normalizePriority(String(item.priority || "medium")),
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

function normalizePriority(value) {
  const clean = getCleanValue(value).toLowerCase();
  if (clean === "high" || clean === "low") {
    return clean;
  }
  return "medium";
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
  if (!value) {
    return "";
  }
  return value[0].toUpperCase() + value.slice(1);
}

function normalizeUrl(value) {
  try {
    return new URL(String(value || "").trim()).toString();
  } catch {
    return String(value || "").trim();
  }
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

function editItemById(id) {
  const target = state.items.find((item) => item.id === id);
  if (!target) {
    return false;
  }

  const nextTitle = window.prompt("Item name:", target.title || "");
  if (nextTitle === null) {
    return false;
  }

  const nextUrl = window.prompt("Product link:", target.url || "");
  if (nextUrl === null) {
    return false;
  }

  const nextImage = window.prompt("Photo link (optional):", target.image || "");
  if (nextImage === null) {
    return false;
  }

  const nextCategory = window.prompt("Category:", target.category || "");
  if (nextCategory === null) {
    return false;
  }

  const nextPriority = window.prompt("Priority (high, medium, low):", target.priority || "medium");
  if (nextPriority === null) {
    return false;
  }

  const nextPrice = window.prompt("Price (optional):", target.price || "");
  if (nextPrice === null) {
    return false;
  }

  const nextSize = window.prompt("Size (optional):", target.size || "");
  if (nextSize === null) {
    return false;
  }

  const nextColor = window.prompt("Color (optional):", target.color || "");
  if (nextColor === null) {
    return false;
  }

  const nextNote = window.prompt("Note (optional):", target.note || "");
  if (nextNote === null) {
    return false;
  }

  const normalizedTitle = getCleanValue(nextTitle);
  if (!normalizedTitle) {
    window.alert("Item name cannot be empty.");
    return false;
  }

  const normalizedUrl = normalizeRequiredUrl(nextUrl);
  if (!normalizedUrl) {
    window.alert("Please enter a valid product link.");
    return false;
  }

  const normalizedImage = normalizeOptionalUrl(nextImage);
  if (normalizedImage === null) {
    window.alert("Photo link must be a valid URL, or leave it blank.");
    return false;
  }

  state.items = state.items.map((item) => {
    if (item.id !== id) {
      return item;
    }

    return {
      ...item,
      title: normalizedTitle,
      url: normalizedUrl,
      image: normalizedImage,
      category: getCleanValue(nextCategory) || "Other",
      priority: normalizePriority(nextPriority),
      price: getCleanValue(nextPrice),
      size: getCleanValue(nextSize),
      color: getCleanValue(nextColor),
      note: getCleanValue(nextNote)
    };
  });

  return true;
}

function backfillStarterPhotos() {
  const photoByUrl = new Map(
    STARTER_ITEMS.filter((item) => item.image).map((item) => [normalizeUrl(item.url), item.image])
  );

  let didChange = false;
  state.items = state.items.map((item) => {
    if (item.image) {
      return item;
    }

    const starterImage = photoByUrl.get(normalizeUrl(item.url));
    if (!starterImage) {
      return item;
    }

    didChange = true;
    return { ...item, image: starterImage };
  });

  if (didChange) {
    persistItems(state.items);
  }
}
