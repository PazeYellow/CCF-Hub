(function () {
  const state = {
    user: null,
    cards: [],
    selectedIndex: -1
  };

  const fields = ["name", "type", "attribute", "race", "level", "statusField", "atk", "def", "image", "tags", "text"];
  const dom = {};

  document.addEventListener("DOMContentLoaded", function () {
    [
      "authPanel", "authMessage", "editorWorkspace", "loginEmail", "loginPassword", "loginButton",
      "sessionMeta", "logoutButton", "syncDatabase", "cardSearch", "cardList", "editorStatus",
      "cardCount", "newCard", "saveLocal", "saveLive", "deleteCard", "editorMessage"
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
    dom.cardSearch.addEventListener("input", renderList);
    dom.newCard.addEventListener("click", newCard);
    dom.saveLocal.addEventListener("click", saveDraft);
    dom.saveLive.addEventListener("click", saveLive);
    dom.deleteCard.addEventListener("click", deleteCard);
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
    dom.authPanel.classList.remove("hidden");
    dom.editorWorkspace.classList.add("hidden");
    setNotice(dom.authMessage, message || "");
  }

  function showLoggedIn() {
    dom.authPanel.classList.add("hidden");
    dom.editorWorkspace.classList.remove("hidden");
    dom.sessionMeta.textContent = `${state.user.displayName || state.user.email} (${state.user.role})`;
    const owner = state.user.role === "owner";
    dom.saveLive.disabled = !owner;
    dom.deleteCard.disabled = !owner;
  }

  async function loadDatabase() {
    try {
      const data = await window.CCF_API.request("/api/database");
      state.cards = Array.isArray(data.cards) ? data.cards.map(normaliseCard) : [];
      state.selectedIndex = state.cards.length ? 0 : -1;
      showForm();
      renderList();
      setNotice(dom.editorMessage, `Synced ${state.cards.length} cards.`);
    } catch (error) {
      setNotice(dom.editorMessage, error.message, true);
    }
  }

  function renderList() {
    const query = dom.cardSearch.value.trim().toLowerCase();
    const filtered = state.cards
      .map((card, index) => ({ card, index }))
      .filter((item) => item.card.name.toLowerCase().includes(query));

    dom.cardList.innerHTML = "";
    dom.cardCount.textContent = `${filtered.length} of ${state.cards.length} cards`;

    if (!filtered.length) {
      dom.cardList.innerHTML = '<div class="empty-state">No cards found.</div>';
      return;
    }

    filtered.forEach(({ card, index }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = index === state.selectedIndex ? "active" : "";
      button.textContent = card.name;
      button.addEventListener("click", function () {
        saveDraft(false);
        state.selectedIndex = index;
        showForm();
        renderList();
      });
      dom.cardList.appendChild(button);
    });
  }

  function newCard() {
    const card = {
      id: `card-${Date.now()}`,
      name: "New Draft Card",
      type: "Monster",
      status: "Draft",
      tags: []
    };
    state.cards.push(card);
    state.selectedIndex = state.cards.length - 1;
    showForm();
    renderList();
  }

  function saveDraft(showMessage) {
    if (state.selectedIndex < 0) return;
    state.cards[state.selectedIndex] = formValues();
    renderList();
    if (showMessage !== false) setNotice(dom.editorMessage, "Draft saved locally.");
  }

  async function saveLive() {
    if (state.user.role !== "owner") return;
    saveDraft(false);
    try {
      const data = await window.CCF_API.request("/api/admin/database", {
        method: "PUT",
        body: { database: { schemaVersion: 1, cards: state.cards } }
      });
      state.cards = data.database.cards.map(normaliseCard);
      renderList();
      setNotice(dom.editorMessage, "Database saved to Cloudflare.");
    } catch (error) {
      setNotice(dom.editorMessage, error.message, true);
    }
  }

  function deleteCard() {
    if (state.user.role !== "owner" || state.selectedIndex < 0) return;
    const card = state.cards[state.selectedIndex];
    if (!confirm(`Delete "${card.name}" from the database?`)) return;
    state.cards.splice(state.selectedIndex, 1);
    state.selectedIndex = Math.min(state.selectedIndex, state.cards.length - 1);
    showForm();
    renderList();
  }

  function showForm() {
    const card = state.cards[state.selectedIndex] || {};
    fields.forEach((field) => {
      const key = field === "statusField" ? "status" : field;
      dom[field].value = key === "tags" && Array.isArray(card.tags) ? card.tags.join(", ") : card[key] || "";
    });
    dom.editorStatus.textContent = card.name || "No card selected";
  }

  function formValues() {
    const current = state.cards[state.selectedIndex] || {};
    return {
      id: current.id || `card-${Date.now()}`,
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
    };
  }

  function normaliseCard(card) {
    return {
      id: String(card.id || `card-${Date.now()}`),
      name: String(card.name || "Unnamed Card"),
      type: String(card.type || "Card"),
      attribute: String(card.attribute || ""),
      race: String(card.race || ""),
      level: String(card.level || ""),
      status: String(card.status || "Released"),
      atk: String(card.atk || ""),
      def: String(card.def || ""),
      image: String(card.image || ""),
      tags: Array.isArray(card.tags) ? card.tags.map(String) : [],
      text: String(card.text || "")
    };
  }

  function setNotice(element, message, danger) {
    element.textContent = message || "";
    element.classList.toggle("hidden", !message);
    element.classList.toggle("danger", Boolean(danger));
  }
})();
