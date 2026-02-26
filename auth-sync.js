(() => {
  const USERS_COLLECTION = "users";
  const LISTS_COLLECTION = "lists";
  const META_SUFFIX = "-meta-v1";
  const BACKUP_SUFFIX = "-backup-v1";
  const REQUIRED_CONFIG_FIELDS = ["apiKey", "authDomain", "projectId", "appId"];

  const refs = {
    openAuth: document.getElementById("open-auth"),
    closeAuth: document.getElementById("close-auth"),
    signOut: document.getElementById("auth-signout"),
    status: document.getElementById("auth-status"),
    backdrop: document.getElementById("auth-backdrop"),
    title: document.getElementById("auth-title"),
    form: document.getElementById("auth-form"),
    email: document.getElementById("auth-email"),
    password: document.getElementById("auth-password"),
    submit: document.getElementById("auth-submit"),
    switchMode: document.getElementById("auth-switch-mode"),
    feedback: document.getElementById("auth-feedback")
  };

  const saveQueues = new Map();
  const authListeners = new Set();

  let authMode = "signin";
  let firebaseReady = false;
  let auth = null;
  let db = null;
  let currentUser = null;

  initialize();

  function initialize() {
    wireUi();
    applyAuthModeUi();

    const config = window.WISHLIST_FIREBASE_CONFIG;
    if (!isConfigValid(config) || !window.firebase) {
      setLoggedOutUi("local only");
      setFeedback("sync is off until firebase config is added", "muted");
      exposeApi();
      notifyAuthListeners();
      return;
    }

    try {
      if (!window.firebase.apps.length) {
        window.firebase.initializeApp(config);
      }

      auth = window.firebase.auth();
      db = window.firebase.firestore();
      firebaseReady = true;

      auth.onAuthStateChanged((user) => {
        currentUser = user || null;
        updateAuthUi();
        notifyAuthListeners();
      });

      updateAuthUi();
      setFeedback("sign in to sync this device", "muted");
    } catch (error) {
      console.error("Firebase setup failed:", error);
      firebaseReady = false;
      setLoggedOutUi("local only");
      setFeedback("firebase setup failed. check firebase-config.js", "error");
    }

    exposeApi();
  }

  function wireUi() {
    refs.openAuth?.addEventListener("click", () => {
      openAuthModal();
    });

    refs.closeAuth?.addEventListener("click", () => {
      closeAuthModal();
    });

    refs.backdrop?.addEventListener("click", (event) => {
      if (event.target === refs.backdrop) {
        closeAuthModal();
      }
    });

    refs.form?.addEventListener("submit", handleAuthSubmit);

    refs.switchMode?.addEventListener("click", () => {
      authMode = authMode === "signin" ? "register" : "signin";
      applyAuthModeUi();
      clearAuthFeedback();
      refs.password?.focus();
    });

    refs.signOut?.addEventListener("click", async () => {
      if (!firebaseReady || !auth) {
        return;
      }

      try {
        await auth.signOut();
        setFeedback("signed out on this device", "muted");
      } catch (error) {
        console.error("Sign out failed:", error);
        setFeedback("could not sign out right now", "error");
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && refs.backdrop && !refs.backdrop.hidden) {
        closeAuthModal();
      }
    });
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();

    if (!firebaseReady || !auth) {
      setFeedback("add firebase config first, then try again", "error");
      return;
    }

    const email = getCleanValue(refs.email?.value);
    const password = getCleanValue(refs.password?.value);

    if (!email || !password) {
      setFeedback("email and password are required", "error");
      return;
    }

    if (password.length < 6) {
      setFeedback("password must be at least 6 characters", "error");
      return;
    }

    setAuthLoading(true);
    clearAuthFeedback();

    try {
      if (authMode === "register") {
        await auth.createUserWithEmailAndPassword(email, password);
        setFeedback("account created and signed in", "success");
      } else {
        await auth.signInWithEmailAndPassword(email, password);
        setFeedback("signed in", "success");
      }

      closeAuthModal();
    } catch (error) {
      console.error("Auth failed:", error);
      setFeedback(readableAuthError(error), "error");
    } finally {
      setAuthLoading(false);
    }
  }

  function applyAuthModeUi() {
    if (!refs.title || !refs.submit || !refs.switchMode || !refs.password) {
      return;
    }

    if (authMode === "register") {
      refs.title.textContent = "create account";
      refs.submit.textContent = "create account";
      refs.switchMode.textContent = "use sign in";
      refs.password.setAttribute("autocomplete", "new-password");
      return;
    }

    refs.title.textContent = "sign in to sync";
    refs.submit.textContent = "sign in";
    refs.switchMode.textContent = "create account";
    refs.password.setAttribute("autocomplete", "current-password");
  }

  function openAuthModal() {
    if (!refs.backdrop) {
      return;
    }

    refs.backdrop.hidden = false;
    syncBodyModalState();

    if (!firebaseReady) {
      setFeedback("open firebase-config.js and paste your firebase web app config", "muted");
    } else {
      clearAuthFeedback();
    }

    refs.email?.focus();
  }

  function closeAuthModal() {
    if (!refs.backdrop) {
      return;
    }

    refs.backdrop.hidden = true;
    refs.form?.reset();
    syncBodyModalState();
  }

  function updateAuthUi() {
    if (currentUser) {
      setSignedInUi(currentUser.email || "signed in");
      return;
    }

    setLoggedOutUi("local only");
  }

  function setSignedInUi(label) {
    if (refs.status) {
      refs.status.textContent = `synced: ${label}`;
    }

    if (refs.openAuth) {
      refs.openAuth.textContent = "account";
      refs.openAuth.hidden = false;
    }

    if (refs.signOut) {
      refs.signOut.hidden = false;
    }
  }

  function setLoggedOutUi(label) {
    if (refs.status) {
      refs.status.textContent = firebaseReady ? `${label} (not signed in)` : label;
    }

    if (refs.openAuth) {
      refs.openAuth.textContent = firebaseReady ? "sign in" : "setup";
      refs.openAuth.hidden = false;
    }

    if (refs.signOut) {
      refs.signOut.hidden = true;
    }
  }

  function setAuthLoading(loading) {
    if (refs.submit) {
      refs.submit.disabled = loading;
    }

    if (refs.switchMode) {
      refs.switchMode.disabled = loading;
    }

    if (refs.closeAuth) {
      refs.closeAuth.disabled = loading;
    }
  }

  function clearAuthFeedback() {
    if (!refs.feedback) {
      return;
    }

    if (firebaseReady) {
      setFeedback("sign in to sync this device", "muted");
    }
  }

  function setFeedback(message, tone) {
    if (!refs.feedback) {
      return;
    }

    refs.feedback.textContent = message;
    refs.feedback.classList.remove("is-muted", "is-success", "is-error");
    refs.feedback.classList.add(`is-${tone}`);
  }

  function syncBodyModalState() {
    const hasOpenOverlay = Array.from(document.querySelectorAll(".modal-backdrop, .confirm-backdrop")).some(
      (element) => !element.hidden
    );
    document.body.classList.toggle("modal-open", hasOpenOverlay);
  }

  function readableAuthError(error) {
    const code = error && error.code ? String(error.code) : "";
    const messages = {
      "auth/email-already-in-use": "this email is already in use",
      "auth/invalid-email": "email format is invalid",
      "auth/user-not-found": "no account found for this email",
      "auth/wrong-password": "password is incorrect",
      "auth/invalid-credential": "email or password is incorrect",
      "auth/weak-password": "password is too weak",
      "auth/too-many-requests": "too many attempts. try again later",
      "auth/network-request-failed": "network error. check your connection"
    };

    return messages[code] || "authentication failed";
  }

  function isConfigValid(config) {
    if (!config || typeof config !== "object") {
      return false;
    }

    return REQUIRED_CONFIG_FIELDS.every((field) => getCleanValue(config[field]));
  }

  function notifyAuthListeners() {
    authListeners.forEach((listener) => {
      try {
        listener(currentUser);
      } catch (error) {
        console.error("Auth listener failed:", error);
      }
    });
  }

  function onAuthChange(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }

    authListeners.add(listener);
    listener(currentUser);

    return () => {
      authListeners.delete(listener);
    };
  }

  function getListRef(listId) {
    if (!db || !currentUser) {
      return null;
    }

    return db.collection(USERS_COLLECTION).doc(currentUser.uid).collection(LISTS_COLLECTION).doc(listId);
  }

  async function syncList(listId, localKey, localItems) {
    if (!firebaseReady || !currentUser) {
      return sanitizeItems(localItems);
    }

    const local = sanitizeItems(localItems);
    if (local.length > 0) {
      createBackup(localKey, local);
    }

    const localMeta = readLocalMeta(localKey);
    const localUpdatedAt = normalizeTimestamp(localMeta.updatedAtMs, getLatestUpdate(local));

    let cloud = [];
    let cloudUpdatedAt = 0;

    const ref = getListRef(listId);
    if (!ref) {
      return local;
    }

    try {
      const snapshot = await ref.get();
      if (snapshot.exists) {
        const data = snapshot.data() || {};
        cloud = sanitizeItems(data.items);
        cloudUpdatedAt = normalizeTimestamp(data.updatedAtMs, 0);
      }
    } catch (error) {
      console.error("Cloud read failed:", error);
      return local;
    }

    let merged = [];
    if (!cloud.length && !local.length) {
      merged = [];
    } else if (!cloud.length) {
      merged = local;
    } else if (!local.length) {
      merged = cloud;
    } else {
      const preferCloudOrder = cloudUpdatedAt > localUpdatedAt;
      merged = mergeById(local, cloud, preferCloudOrder);
    }

    const mergedUpdatedAt = Math.max(localUpdatedAt, cloudUpdatedAt, getLatestUpdate(merged)) || Date.now();
    writeLocalMeta(localKey, mergedUpdatedAt, currentUser.uid);

    if (!isSameItems(merged, cloud) || mergedUpdatedAt > cloudUpdatedAt) {
      await writeList(listId, merged, mergedUpdatedAt);
    }

    return merged;
  }

  function saveList(listId, localKey, items) {
    if (!firebaseReady || !currentUser) {
      return Promise.resolve();
    }

    const payload = sanitizeItems(items);
    const updatedAtMs = Math.max(getLatestUpdate(payload), Date.now());
    writeLocalMeta(localKey, updatedAtMs, currentUser.uid);

    const queueKey = `${currentUser.uid}:${listId}`;
    const previous = saveQueues.get(queueKey) || Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(() => writeList(listId, payload, updatedAtMs))
      .catch((error) => {
        console.error("Cloud write failed:", error);
      });

    saveQueues.set(queueKey, next);
    return next;
  }

  async function writeList(listId, items, updatedAtMs) {
    const ref = getListRef(listId);
    if (!ref) {
      return;
    }

    await ref.set(
      {
        items,
        updatedAtMs,
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  }

  function noteLocalChange(localKey, updatedAtMs) {
    const nextUpdatedAt = normalizeTimestamp(updatedAtMs, Date.now());
    const userId = currentUser ? currentUser.uid : "";
    writeLocalMeta(localKey, nextUpdatedAt, userId);
  }

  function mergeById(localItems, cloudItems, preferCloudOrder) {
    const resolvedMap = new Map();

    const assignNewer = (item) => {
      const existing = resolvedMap.get(item.id);
      if (!existing) {
        resolvedMap.set(item.id, item);
        return;
      }

      const nextUpdatedAt = normalizeTimestamp(item._updatedAt || item.updatedAt || item.createdAt, 0);
      const existingUpdatedAt = normalizeTimestamp(
        existing._updatedAt || existing.updatedAt || existing.createdAt,
        0
      );

      if (nextUpdatedAt >= existingUpdatedAt) {
        resolvedMap.set(item.id, item);
      }
    };

    cloudItems.forEach(assignNewer);
    localItems.forEach(assignNewer);

    const orderedIds = [];
    const pushUniqueId = (id) => {
      if (!orderedIds.includes(id)) {
        orderedIds.push(id);
      }
    };

    const primary = preferCloudOrder ? cloudItems : localItems;
    const secondary = preferCloudOrder ? localItems : cloudItems;

    primary.forEach((item) => pushUniqueId(item.id));
    secondary.forEach((item) => pushUniqueId(item.id));

    return orderedIds
      .map((id) => resolvedMap.get(id))
      .filter(Boolean)
      .map((item) => ({ ...item }));
  }

  function sanitizeItems(items) {
    if (!Array.isArray(items)) {
      return [];
    }

    return items
      .filter((item) => item && typeof item === "object")
      .map((item, index) => {
        const clone = { ...item };
        clone.id = normalizeId(clone.id, index);
        clone._updatedAt = normalizeTimestamp(clone._updatedAt || clone.updatedAt || clone.createdAt, Date.now());
        return clone;
      });
  }

  function normalizeId(id, index) {
    const clean = getCleanValue(id);
    if (clean) {
      return clean;
    }

    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    return `item-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`;
  }

  function createBackup(localKey, items) {
    const payload = {
      savedAt: Date.now(),
      items
    };

    localStorage.setItem(`${localKey}${BACKUP_SUFFIX}`, JSON.stringify(payload));
  }

  function readLocalMeta(localKey) {
    const raw = localStorage.getItem(`${localKey}${META_SUFFIX}`);
    if (!raw) {
      return {};
    }

    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeLocalMeta(localKey, updatedAtMs, uid) {
    const previous = readLocalMeta(localKey);
    const payload = {
      ...previous,
      updatedAtMs: normalizeTimestamp(updatedAtMs, Date.now()),
      updatedBy: uid || previous.updatedBy || "",
      savedAt: Date.now()
    };

    localStorage.setItem(`${localKey}${META_SUFFIX}`, JSON.stringify(payload));
  }

  function getLatestUpdate(items) {
    if (!Array.isArray(items) || !items.length) {
      return 0;
    }

    return items.reduce((latest, item) => {
      const updatedAt = normalizeTimestamp(item._updatedAt || item.updatedAt || item.createdAt, 0);
      return updatedAt > latest ? updatedAt : latest;
    }, 0);
  }

  function normalizeTimestamp(value, fallback) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }

    return fallback;
  }

  function isSameItems(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function getCleanValue(value) {
    return String(value || "").trim();
  }

  function exposeApi() {
    window.WishlistCloud = {
      isReady: () => firebaseReady,
      getCurrentUser: () => currentUser,
      onAuthChange,
      syncList,
      saveList,
      noteLocalChange
    };
  }
})();
