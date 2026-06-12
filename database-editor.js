(function () {
  const state = {
    user: null,
    database: { schemaVersion: 1, updatedAt: "", cards: [] },
    cards: [],
    selectedIndex: -1,
    dirty: false,
    officialSearchTimer: null
  };

  const fields = [
    "source", "officialId", "name", "type", "attribute", "race", "level",
    "statusField", "atk", "def", "image", "tags", "text"
  ];
  const dom = {};

  document.addEventListener("DOMContentLoaded", function () {
    [
      "authPanel", "authMessage", "editorWorkspace", "loginEmail", "loginPassword", "loginButton",
      "sessionMeta", "sessionAvatar", "logoutButton", "syncDatabase", "saveLive", "cardSearch",
      "statusFilter", "sourceFilter", "cardList", "editorStatus", "selectedIndexMeta", "cardCount",
      "dirtyState", "officialCardSearch", "officialCardResults", "newCard", "duplicateCard",
      "saveLocal", "deleteCard", "editorMessage", "imagePreview", "previewName", "previewPills",
      "previewText"
    ].concat(fields).forEach((id) => {
      dom[id] = document.getElementById(id);
    });

    bindEvents();
    boot();
  });

  function bindEvents() {
    dom.loginButton.addEventListener("click", login);
    dom.logoutButton.addEventListener("click", logout);
    dom.syncDatabase.addEventListener("click", loadDatabase);
    dom.saveLive.addEventListener("click", saveLive);
    dom.cardSearch.addEventListener("input", renderList);
    dom.statusFilter.addEventListener("change", renderList);
    dom.sourceFilter.addEventListener("change", renderList);
    dom.officialCardSearch.addEventListener("input", queueOfficialCardSearch);
    dom.newCard.addEventListener("click", newCard);
    dom.duplicateCard.addEventListener("click", duplicateCard);
    dom.saveLocal.addEventListener("click", () => saveDraft(true));
    dom.deleteCard.addEventListener("click", deleteCard);

    fields.forEach((field) => {
      dom[field].addEventListener("input", renderPreviewFromForm);
      dom[field].addEventListener("change", renderPreviewFromForm);
    });
  }

  async function boot() {
    if (!window.CCF_API.token()) {
      showLoggedOut();
      return;
    }

    try {
      state.user = await window.CCF_API.me();
      showLoggedIn();
      await loadDatabase();
    } catch (error) {
      window.CCF_API.setToken("");
      showLoggedOut(error.message);
    }
  }

  async function login() {
    setNotice(dom.authMessage, "");
    try {
      state.user = await window.CCF_API.login(dom.loginEmail.value, dom.loginPassword.value);
      dom.loginPassword.value = "";
      showLoggedIn();
      await loadDatabase();
    } catch (error) {
      setNotice(dom.authMessage, error.message, true);
    }
  }

  async function logout() {
    await window.CCF_API.logout();
    showLoggedOut();
  }

  function showLoggedOut(message) {
    state.user = null;
    dom.authPanel.classList.remove("hidden");
    dom.editorWorkspace.classList.add("hidden");
    setNotice(dom.authMessage, message || "");
  }

  function showLoggedIn() {
    const displayName = state.user.displayName || state.user.email;
    const color = state.user.profileColor || "#45d5c6";
    const avatarUrl = state.user.avatarUrl || "";

    dom.authPanel.classList.add("hidden");
    dom.editorWorkspace.classList.remove("hidden");
    dom.sessionMeta.textContent = `${displayName} (${state.user.role})`;
    dom.sessionAvatar.style.backgroundColor = color;
    dom.sessionAvatar.style.backgroundImage = avatarUrl ? `url("${avatarUrl}")` : "";
    dom.sessionAvatar.textContent = avatarUrl ? "" : initials(displayName);

    const owner = isOwner();
    dom.saveLive.disabled = !owner;
    dom.deleteCard.disabled = !owner;
    if (!owner) {
      setNotice(dom.editorMessage, "Admins can review and draft locally here. Owners publish database changes.");
    }
  }

  async function loadDatabase() {
    if (state.dirty && !confirm("Discard unpublished local changes and sync from Cloudflare?")) return;

    try {
      const data = await window.CCF_API.request("/api/database");
      state.database = {
        schemaVersion: Number(data.schemaVersion || 1) || 1,
        updatedAt: data.updatedAt || "",
        cards: Array.isArray(data.cards) ? data.cards : []
      };
      state.cards = state.database.cards.map(normaliseCard);
      state.selectedIndex = state.cards.length ? 0 : -1;
      state.dirty = false;
      hydrateFilters();
      showForm();
      renderList();
      setNotice(dom.editorMessage, `Synced ${state.cards.length} cards.`);
    } catch (error) {
      setNotice(dom.editorMessage, error.message, true);
    }
  }

  function hydrateFilters() {
    const statuses = Array.from(new Set(state.cards.map((card) => card.status).filter(Boolean))).sort();
    const current = dom.statusFilter.value;
    dom.statusFilter.innerHTML = '<option value="all">All</option>';
    statuses.forEach((status) => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status;
      dom.statusFilter.appendChild(option);
    });
    dom.statusFilter.value = statuses.includes(current) ? current : "all";
  }

  function renderList() {
    const query = dom.cardSearch.value.trim().toLowerCase();
    const status = dom.statusFilter.value;
    const source = dom.sourceFilter.value;
    const filtered = state.cards
      .map((card, index) => ({ card, index }))
      .filter(({ card }) => matches(card, query))
      .filter(({ card }) => status === "all" || card.status === status)
      .filter(({ card }) => source === "all" || card.source === source);

    dom.cardList.innerHTML = "";
    dom.cardCount.textContent = `${filtered.length} of ${state.cards.length} cards`;
    dom.dirtyState.textContent = state.dirty ? "Unpublished changes" : "No unpublished changes";
    dom.dirtyState.classList.toggle("dirty-text", state.dirty);

    if (!filtered.length) {
      dom.cardList.innerHTML = '<div class="empty-state">No cards found.</div>';
      return;
    }

    filtered.forEach(({ card, index }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = index === state.selectedIndex ? "active" : "";
      button.innerHTML = `<span>${escapeHtml(card.name)}</span><small>${escapeHtml(card.status || "Draft")} / ${escapeHtml(card.source)}</small>`;
      button.addEventListener("click", function () {
        saveDraft(false);
        state.selectedIndex = index;
        showForm();
        renderList();
      });
      dom.cardList.appendChild(button);
    });
  }

  function matches(card, query) {
    if (!query) return true;
    return [
      card.name,
      card.type,
      card.attribute,
      card.race,
      card.status,
      card.text,
      card.tags.join(" ")
    ].join(" ").toLowerCase().includes(query);
  }

  function newCard() {
    saveDraft(false);
    const card = normaliseCard({
      id: `card-${Date.now()}`,
      source: "custom",
      name: "New Draft Card",
      type: "Monster",
      status: "Draft",
      tags: []
    });
    state.cards.push(card);
    state.selectedIndex = state.cards.length - 1;
    markDirty();
    hydrateFilters();
    showForm();
    renderList();
  }

  function duplicateCard() {
    if (state.selectedIndex < 0) return;
    saveDraft(false);
    const current = state.cards[state.selectedIndex];
    const copy = normaliseCard({
      ...current,
      id: `card-${Date.now()}`,
      name: `${current.name} Copy`,
      status: "Draft"
    });
    state.cards.push(copy);
    state.selectedIndex = state.cards.length - 1;
    markDirty();
    hydrateFilters();
    showForm();
    renderList();
  }

  function saveDraft(showMessage) {
    if (state.selectedIndex < 0) return;
    const nextCard = formValues();
    const changed = JSON.stringify(state.cards[state.selectedIndex]) !== JSON.stringify(nextCard);
    state.cards[state.selectedIndex] = nextCard;
    if (changed) markDirty();
    hydrateFilters();
    renderList();
    renderPreviewFromForm();
    if (showMessage !== false) setNotice(dom.editorMessage, "Draft saved locally.");
  }

  async function saveLive() {
    if (!isOwner()) return;
    saveDraft(false);

    try {
      const data = await window.CCF_API.request("/api/admin/database", {
        method: "PUT",
        body: {
          database: {
            schemaVersion: state.database.schemaVersion || 1,
            cards: state.cards
          }
        }
      });

      state.database = data.database;
      state.cards = data.database.cards.map(normaliseCard);
      state.dirty = false;
      hydrateFilters();
      renderList();
      setNotice(dom.editorMessage, "Database published to Cloudflare.");
    } catch (error) {
      setNotice(dom.editorMessage, error.message, true);
    }
  }

  function deleteCard() {
    if (!isOwner() || state.selectedIndex < 0) return;
    const card = state.cards[state.selectedIndex];
    if (!confirm(`Delete "${card.name}" from the database?`)) return;
    state.cards.splice(state.selectedIndex, 1);
    state.selectedIndex = Math.min(state.selectedIndex, state.cards.length - 1);
    markDirty();
    hydrateFilters();
    showForm();
    renderList();
  }

  function showForm() {
    const card = state.cards[state.selectedIndex] || null;

    if (!card) {
      fields.forEach((field) => {
        dom[field].value = field === "source" ? "custom" : "";
      });
      dom.statusField.value = "Draft";
      dom.editorStatus.textContent = "No card selected";
      dom.selectedIndexMeta.textContent = "-";
      renderPreview(null);
      return;
    }

    fields.forEach((field) => {
      const key = field === "statusField" ? "status" : field;
      dom[field].value = key === "tags" ? card.tags.join(", ") : card[key] || "";
    });

    dom.editorStatus.textContent = card.name;
    dom.selectedIndexMeta.textContent = `Card ${state.selectedIndex + 1}`;
    renderPreview(card);
  }

  function formValues() {
    const current = state.cards[state.selectedIndex] || {};
    return normaliseCard({
      ...current,
      id: current.id || `card-${Date.now()}`,
      source: dom.source.value,
      officialId: dom.officialId.value.trim(),
      name: dom.name.value.trim() || "Unnamed Card",
      type: dom.type.value.trim() || "Monster",
      attribute: dom.attribute.value.trim(),
      race: dom.race.value.trim(),
      level: dom.level.value.trim(),
      status: dom.statusField.value.trim() || "Draft",
      atk: dom.atk.value.trim(),
      def: dom.def.value.trim(),
      image: dom.image.value.trim(),
      tags: dom.tags.value.split(",").map((tag) => tag.trim()).filter(Boolean),
      text: dom.text.value.trim()
    });
  }

  function renderPreviewFromForm() {
    renderPreview(formValues());
  }

  function renderPreview(card) {
    dom.imagePreview.innerHTML = "";
    dom.imagePreview.classList.toggle("missing", !card || !card.image);

    if (card && card.image) {
      const img = document.createElement("img");
      img.src = card.image;
      img.alt = card.name;
      img.onerror = function () {
        dom.imagePreview.classList.add("missing");
        img.remove();
      };
      dom.imagePreview.appendChild(img);
    } else {
      dom.imagePreview.textContent = "CCF";
    }

    dom.previewName.textContent = card?.name || "No card selected";
    dom.previewText.textContent = card?.text || "Create or select a card to preview it.";
    dom.previewPills.innerHTML = "";

    if (!card) return;
    [
      [card.source, "aqua"],
      [card.type, "gold"],
      [card.status, "rose"],
      [card.attribute, ""]
    ].forEach(([text, className]) => {
      if (!text) return;
      const pill = document.createElement("span");
      pill.className = `pill ${className}`.trim();
      pill.textContent = text;
      dom.previewPills.appendChild(pill);
    });
  }

  function queueOfficialCardSearch() {
    clearTimeout(state.officialSearchTimer);
    state.officialSearchTimer = setTimeout(searchOfficialCards, 350);
  }

  async function searchOfficialCards() {
    const query = dom.officialCardSearch.value.trim();
    dom.officialCardResults.innerHTML = "";

    if (query.length < 2) return;

    try {
      const data = await window.CCF_API.request(`/api/admin/cards/search?q=${encodeURIComponent(query)}`);
      renderOfficialCardResults(data.cards || []);
    } catch (error) {
      dom.officialCardResults.innerHTML = `<div class="notice danger">${escapeHtml(error.message)}</div>`;
    }
  }

  function renderOfficialCardResults(cards) {
    dom.officialCardResults.innerHTML = "";

    if (!cards.length) {
      dom.officialCardResults.innerHTML = '<div class="empty-state">No official cards found.</div>';
      return;
    }

    cards.forEach((card) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "official-card-result";
      button.innerHTML = `
        <span class="official-card-thumb">${card.image ? `<img src="${escapeHtml(card.image)}" alt="">` : ""}</span>
        <span><strong>${escapeHtml(card.name)}</strong><small>${escapeHtml(card.type || "Card")}</small></span>
      `;
      button.addEventListener("click", function () {
        fillOfficialCard(card);
      });
      dom.officialCardResults.appendChild(button);
    });
  }

  function fillOfficialCard(card) {
    saveDraft(false);

    const next = normaliseCard({
      id: `card-${Date.now()}`,
      source: "official",
      officialId: card.officialId,
      name: card.name,
      type: card.type,
      image: card.image,
      status: "Draft",
      tags: ["Official"]
    });

    state.cards.push(next);
    state.selectedIndex = state.cards.length - 1;
    markDirty();
    hydrateFilters();
    showForm();
    renderList();
  }

  function normaliseCard(card) {
    return {
      id: String(card.id || `card-${Date.now()}`),
      source: String(card.source || "custom"),
      officialId: String(card.officialId || card.official_id || ""),
      name: String(card.name || "Unnamed Card"),
      type: String(card.type || card.cardType || "Card"),
      attribute: String(card.attribute || ""),
      race: String(card.race || card.subtype || ""),
      level: String(card.level || card.rank || card.linkRating || ""),
      status: String(card.status || card.releaseStatus || "Released"),
      atk: String(card.atk || ""),
      def: String(card.def || ""),
      image: String(card.image || card.imageUrl || card.img || ""),
      tags: normaliseTags(card.tags),
      text: String(card.text || card.effect || card.description || ""),
      updatedAt: String(card.updatedAt || "")
    };
  }

  function normaliseTags(tags) {
    if (Array.isArray(tags)) return tags.map(String).filter(Boolean);
    if (typeof tags === "string") return tags.split(",").map((tag) => tag.trim()).filter(Boolean);
    return [];
  }

  function markDirty() {
    state.dirty = true;
    dom.dirtyState.textContent = "Unpublished changes";
    dom.dirtyState.classList.add("dirty-text");
  }

  function isOwner() {
    return state.user && state.user.role === "owner";
  }

  function setNotice(element, message, danger) {
    element.textContent = message || "";
    element.classList.toggle("hidden", !message);
    element.classList.toggle("danger", Boolean(danger));
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[char];
    });
  }

  function initials(name) {
    return String(name || "CCF")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("") || "CCF";
  }
})();
