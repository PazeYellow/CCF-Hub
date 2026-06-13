(function () {
  const state = {
    user: null,
    database: { schemaVersion: 1, updatedAt: "", cards: [] },
    cards: [],
    selectedIndex: -1,
    dirty: false,
    databaseRequests: [],
    databaseSchedules: [],
    officialSearchTimer: null
  };

  const fields = [
    "source", "officialId", "cardKind", "spellTrapProperty", "name", "type",
    "attribute", "race", "level", "pendulumScale", "linkRating", "statusField",
    "atk", "def", "image", "tags", "pendulumEffect", "text"
  ];
  const dom = {};

  document.addEventListener("DOMContentLoaded", function () {
    [
      "authPanel", "authMessage", "editorWorkspace", "loginEmail", "loginPassword", "loginButton",
      "sessionMeta", "sessionAvatar", "logoutButton", "syncDatabase", "saveLive", "cardSearch",
      "statusFilter", "sourceFilter", "cardList", "editorStatus", "selectedIndexMeta", "cardCount",
      "dirtyState", "officialCardSearch", "officialCardResults", "newCard", "duplicateCard",
      "saveLocal", "deleteCard", "editorMessage", "imagePreview", "previewName", "previewPills",
      "previewText", "monsterAbilities", "linkArrows", "databaseScheduleAt", "scheduleDatabasePublish",
      "refreshDatabaseSchedules", "databaseScheduleList", "refreshDatabaseRequests", "databaseRequestList",
      "databaseRequestNote", "submitDatabaseRequest"
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
    dom.scheduleDatabasePublish.addEventListener("click", scheduleDatabasePublish);
    dom.refreshDatabaseSchedules.addEventListener("click", loadDatabaseSchedules);
    dom.refreshDatabaseRequests.addEventListener("click", loadDatabaseRequests);
    dom.submitDatabaseRequest.addEventListener("click", submitDatabaseRequest);
    dom.databaseRequestNote.addEventListener("keydown", function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        submitDatabaseRequest();
      }
    });

    fields.forEach((field) => {
      dom[field].addEventListener("input", renderPreviewFromForm);
      dom[field].addEventListener("change", renderPreviewFromForm);
    });
    dom.cardKind.addEventListener("change", function () {
      applyCardKindRules(true);
      renderPreviewFromForm();
    });
    getChecks("monsterAbilities").forEach((input) => input.addEventListener("change", function () {
      applyCardKindRules(input.value === "Pendulum");
      renderPreviewFromForm();
    }));
    getChecks("linkArrows").forEach((input) => input.addEventListener("change", renderPreviewFromForm));
    document.addEventListener("keydown", handleKeyboardShortcuts);
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
      await loadDatabaseRequests();
      if (isOwner()) await loadDatabaseSchedules();
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
      await loadDatabaseRequests();
      if (isOwner()) await loadDatabaseSchedules();
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
    document.querySelectorAll(".owner-only").forEach((element) => {
      element.classList.toggle("hidden", !owner);
    });
    document.querySelectorAll(".admin-only").forEach((element) => {
      element.classList.toggle("hidden", owner);
    });
    if (!owner) {
      setNotice(dom.editorMessage, "Admins can draft cards and send database addition requests for owners to approve.");
    }
  }

  function handleKeyboardShortcuts(event) {
    if (dom.editorWorkspace.classList.contains("hidden")) return;
    const command = event.ctrlKey || event.metaKey;

    if (command && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (event.shiftKey) {
        saveLive();
      } else {
        saveDraft(true);
      }
      return;
    }

    if (command && event.key.toLowerCase() === "n") {
      event.preventDefault();
      newCard();
      return;
    }

    if (command && event.key.toLowerCase() === "d" && !isTypingTarget(event.target)) {
      event.preventDefault();
      duplicateCard();
      return;
    }

    if (command && event.key.toLowerCase() === "f") {
      event.preventDefault();
      dom.cardSearch.focus();
      dom.cardSearch.select();
      return;
    }

    if (command && event.key.toLowerCase() === "k") {
      event.preventDefault();
      dom.officialCardSearch.focus();
      dom.officialCardSearch.select();
      return;
    }

    if (event.key === "Delete" && !isTypingTarget(event.target)) {
      event.preventDefault();
      deleteCard();
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

  async function loadDatabaseSchedules() {
    if (!isOwner()) return;
    try {
      const data = await window.CCF_API.request("/api/admin/scheduled-publishes?target=database");
      state.databaseSchedules = data.schedules || [];
      renderDatabaseSchedules();
    } catch (error) {
      setNotice(dom.editorMessage, error.message, true);
    }
  }

  async function loadDatabaseRequests() {
    try {
      const data = await window.CCF_API.request("/api/admin/database/requests");
      state.databaseRequests = data.requests || [];
      renderDatabaseRequests();
    } catch (error) {
      setNotice(dom.editorMessage, error.message, true);
    }
  }

  function renderDatabaseRequests() {
    dom.databaseRequestList.innerHTML = "";

    if (!state.databaseRequests.length) {
      dom.databaseRequestList.innerHTML = '<div class="empty-state">No database requests yet.</div>';
      return;
    }

    state.databaseRequests.forEach((request) => {
      dom.databaseRequestList.appendChild(databaseRequestItem(request));
    });
  }

  function databaseRequestItem(request) {
    const card = request.card || {};
    const requester = request.requesterName || request.requesterEmail || "Admin";
    const item = document.createElement("article");
    item.className = "admin-list-item request-item";
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(card.name || "Unnamed Card")}</strong>
        <p>${escapeHtml(card.type || card.cardKind || "Card")} / ${escapeHtml(card.status || "Draft")} / ${escapeHtml(requester)}</p>
        ${request.note ? `<p>${escapeHtml(request.note)}</p>` : ""}
        <p>${escapeHtml(formatFullDate(request.createdAt))}</p>
      </div>
      <span class="pill ${request.status === "pending" ? "gold" : request.status === "approved" ? "aqua" : "rose"}">${escapeHtml(request.status)}</span>
    `;

    if (isOwner() && request.status === "pending") {
      const actions = document.createElement("div");
      actions.className = "action-row";
      actions.append(
        smallButton("Approve", () => reviewDatabaseRequest(request.id, "approve")),
        smallButton("Reject", () => reviewDatabaseRequest(request.id, "reject"))
      );
      item.appendChild(actions);
    }

    return item;
  }

  function renderDatabaseSchedules() {
    dom.databaseScheduleList.innerHTML = "";
    const schedules = state.databaseSchedules.filter((schedule) => schedule.status === "pending");

    if (!schedules.length) {
      dom.databaseScheduleList.innerHTML = '<div class="empty-state">No pending database publishes.</div>';
      return;
    }

    schedules.forEach((schedule) => {
      dom.databaseScheduleList.appendChild(scheduleItem(schedule));
    });
  }

  function scheduleItem(schedule) {
    const item = document.createElement("article");
    item.className = "admin-list-item schedule-item";
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(schedule.title || "Scheduled publish")}</strong>
        <p>${escapeHtml(schedule.summary || "")}</p>
        <p>${escapeHtml(formatFullDate(schedule.publishAt))} / ${escapeHtml(schedule.status)}</p>
      </div>
      <span class="pill ${schedule.status === "pending" ? "gold" : schedule.status === "published" ? "aqua" : "rose"}">${escapeHtml(schedule.target)}</span>
    `;

    if (schedule.status === "pending") {
      const actions = document.createElement("div");
      actions.className = "action-row";
      actions.append(
        smallButton("Publish Now", () => runScheduleAction(schedule.id, "publish-now")),
        smallButton("Cancel", () => runScheduleAction(schedule.id, "cancel"))
      );
      item.appendChild(actions);
    }

    return item;
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
      card.cardKind,
      card.spellTrapProperty,
      card.attribute,
      card.race,
      card.status,
      card.monsterAbilities.join(" "),
      card.linkArrows.join(" "),
      card.pendulumEffect,
      card.text,
      card.tags.join(" ")
    ].join(" ").toLowerCase().includes(query);
  }

  function newCard() {
    saveDraft(false);
    const card = normaliseCard({
      id: `card-${Date.now()}`,
      source: "custom",
      cardKind: "monster",
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

  async function scheduleDatabasePublish() {
    if (!isOwner()) return;
    saveDraft(false);
    const publishAt = localDateTimeToIso(dom.databaseScheduleAt.value);
    if (!publishAt) {
      setNotice(dom.editorMessage, "Choose a publish time first.", true);
      return;
    }

    try {
      await window.CCF_API.request("/api/admin/scheduled-publishes", {
        method: "POST",
        body: {
          target: "database",
          title: "Database publish",
          publishAt,
          payload: {
            schemaVersion: state.database.schemaVersion || 1,
            cards: state.cards
          }
        }
      });
      dom.databaseScheduleAt.value = "";
      await loadDatabaseSchedules();
      setNotice(dom.editorMessage, "Database publish scheduled.");
    } catch (error) {
      setNotice(dom.editorMessage, error.message, true);
    }
  }

  async function runScheduleAction(id, action) {
    try {
      await window.CCF_API.request(`/api/admin/scheduled-publishes/${id}/${action}`, {
        method: "POST",
        body: {}
      });
      if (action === "publish-now") await loadDatabase();
      await loadDatabaseSchedules();
      setNotice(dom.editorMessage, action === "cancel" ? "Scheduled publish cancelled." : "Scheduled publish applied.");
    } catch (error) {
      setNotice(dom.editorMessage, error.message, true);
    }
  }

  async function submitDatabaseRequest() {
    if (isOwner()) return;
    if (state.selectedIndex < 0) {
      setNotice(dom.editorMessage, "Create or select a card first.", true);
      return;
    }

    saveDraft(false);
    const card = state.cards[state.selectedIndex];

    try {
      await window.CCF_API.request("/api/admin/database/requests", {
        method: "POST",
        body: {
          card,
          note: dom.databaseRequestNote.value
        }
      });
      dom.databaseRequestNote.value = "";
      await loadDatabaseRequests();
      setNotice(dom.editorMessage, "Database request sent to the owners.");
    } catch (error) {
      setNotice(dom.editorMessage, error.message, true);
    }
  }

  async function reviewDatabaseRequest(id, decision) {
    if (!isOwner()) return;

    try {
      await window.CCF_API.request(`/api/admin/database/requests/${id}/${decision}`, {
        method: "POST",
        body: {}
      });
      if (decision === "approve") await loadDatabase();
      await loadDatabaseRequests();
      setNotice(dom.editorMessage, decision === "approve" ? "Database request approved." : "Database request rejected.");
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
      dom.cardKind.value = "monster";
      dom.statusField.value = "Draft";
      setChecks("monsterAbilities", []);
      setChecks("linkArrows", []);
      applyCardKindRules(false);
      dom.editorStatus.textContent = "No card selected";
      dom.selectedIndexMeta.textContent = "-";
      renderPreview(null);
      return;
    }

    fields.forEach((field) => {
      const key = field === "statusField" ? "status" : field;
      dom[field].value = key === "tags" ? card.tags.join(", ") : card[key] || "";
    });
    setChecks("monsterAbilities", card.monsterAbilities);
    setChecks("linkArrows", card.linkArrows);
    applyCardKindRules(false);

    dom.editorStatus.textContent = card.name;
    dom.selectedIndexMeta.textContent = `Card ${state.selectedIndex + 1}`;
    renderPreview(card);
  }

  function formValues() {
    const current = state.cards[state.selectedIndex] || {};
    const cardKind = normaliseCardKind(dom.cardKind.value);
    const monsterMode = cardKind === "monster";
    const monsterAbilities = monsterMode ? readChecks("monsterAbilities") : [];
    const pendulumMode = monsterAbilities.includes("Pendulum");

    return normaliseCard({
      ...current,
      id: current.id || `card-${Date.now()}`,
      source: dom.source.value,
      officialId: dom.officialId.value.trim(),
      cardKind,
      spellTrapProperty: monsterMode ? "" : dom.spellTrapProperty.value,
      name: dom.name.value.trim() || "Unnamed Card",
      type: dom.type.value.trim() || defaultTypeForKind(cardKind),
      attribute: monsterMode ? dom.attribute.value.trim() : "",
      race: monsterMode ? dom.race.value.trim() : "",
      level: monsterMode ? dom.level.value.trim() : "",
      pendulumScale: pendulumMode ? dom.pendulumScale.value.trim() : "",
      linkRating: monsterMode ? dom.linkRating.value.trim() : "",
      status: dom.statusField.value.trim() || "Draft",
      atk: monsterMode ? dom.atk.value.trim() : "",
      def: monsterMode ? dom.def.value.trim() : "",
      image: dom.image.value.trim(),
      tags: dom.tags.value.split(",").map((tag) => tag.trim()).filter(Boolean),
      monsterAbilities,
      linkArrows: monsterMode ? readChecks("linkArrows") : [],
      pendulumEffect: pendulumMode ? dom.pendulumEffect.value.trim() : "",
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
    dom.previewText.textContent = previewText(card);
    dom.previewPills.innerHTML = "";

    if (!card) return;
    [
      [card.source, "aqua"],
      [card.cardKind, ""],
      [card.type, "gold"],
      [card.spellTrapProperty, "aqua"],
      [card.status, "rose"],
      [card.attribute, ""],
      [card.monsterAbilities.join(" / "), ""],
      [card.linkRating ? `LINK-${card.linkRating}` : "", ""],
      [card.linkArrows.length ? `Arrows: ${card.linkArrows.join(", ")}` : "", ""],
      [card.pendulumScale ? `Scale ${card.pendulumScale}` : "", ""]
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
      cardKind: card.cardKind,
      spellTrapProperty: card.spellTrapProperty,
      name: card.name,
      type: card.type,
      attribute: card.attribute,
      race: card.race,
      level: card.level,
      pendulumScale: card.pendulumScale,
      linkRating: card.linkRating,
      atk: card.atk,
      def: card.def,
      image: card.image,
      pendulumEffect: card.pendulumEffect,
      text: card.text,
      monsterAbilities: card.monsterAbilities,
      linkArrows: card.linkArrows,
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
    const cardKind = normaliseCardKind(card.cardKind || card.card_kind || card.frameType || card.frame_type || card.type);
    const monsterMode = cardKind === "monster";
    const spellTrapProperty = monsterMode ? "" : (card.spellTrapProperty || card.spell_trap_property || card.race || "");
    const splitText = splitPendulumDescription(card.text || card.effect || card.description || "");
    const monsterAbilities = monsterMode ? normaliseList(card.monsterAbilities || card.monster_abilities || inferAbilities(card.type)) : [];
    const pendulumMode = monsterAbilities.includes("Pendulum");

    return {
      id: String(card.id || `card-${Date.now()}`),
      source: String(card.source || "custom"),
      officialId: String(card.officialId || card.official_id || ""),
      cardKind,
      spellTrapProperty: String(spellTrapProperty || ""),
      name: String(card.name || "Unnamed Card"),
      type: String(card.type || card.cardType || "Card"),
      attribute: monsterMode ? String(card.attribute || "") : "",
      race: monsterMode ? String(card.race || card.subtype || "") : "",
      level: monsterMode ? valueText(card.level ?? card.rank ?? card.linkRating ?? "") : "",
      pendulumScale: pendulumMode ? valueText(card.pendulumScale ?? card.pendulum_scale ?? card.scale ?? "") : "",
      linkRating: monsterMode ? valueText(card.linkRating ?? card.link_rating ?? card.linkval ?? "") : "",
      status: String(card.status || card.releaseStatus || "Released"),
      atk: monsterMode ? valueText(card.atk ?? "") : "",
      def: monsterMode ? valueText(card.def ?? "") : "",
      image: String(card.image || card.imageUrl || card.img || ""),
      tags: normaliseTags(card.tags),
      monsterAbilities,
      linkArrows: monsterMode ? normaliseList(card.linkArrows || card.link_arrows || card.linkmarkers) : [],
      pendulumEffect: pendulumMode ? String(card.pendulumEffect || card.pendulum_effect || card.pend_desc || splitText.pendulum || "") : "",
      text: String(card.monsterText || card.monster_text || card.monster_desc || splitText.monster || card.text || card.effect || card.description || ""),
      updatedAt: String(card.updatedAt || "")
    };
  }

  function applyCardKindRules(clearHidden) {
    const monsterMode = dom.cardKind.value === "monster";
    const pendulumMode = monsterMode && readChecks("monsterAbilities").includes("Pendulum");

    document.querySelectorAll(".monster-field").forEach((element) => {
      element.classList.toggle("hidden", !monsterMode);
    });
    document.querySelectorAll(".spell-trap-field").forEach((element) => {
      element.classList.toggle("hidden", monsterMode);
    });
    document.querySelectorAll(".pendulum-field").forEach((element) => {
      element.classList.toggle("hidden", !pendulumMode);
    });

    if (!clearHidden) return;

    updateTypeForKind(monsterMode);

    if (!monsterMode) {
      clearMonsterFields();
      return;
    }

    dom.spellTrapProperty.value = "";
    if (!pendulumMode) {
      dom.pendulumScale.value = "";
      dom.pendulumEffect.value = "";
    }
  }

  function clearMonsterFields() {
    ["attribute", "race", "level", "pendulumScale", "linkRating", "atk", "def", "pendulumEffect"].forEach((field) => {
      dom[field].value = "";
    });
    setChecks("monsterAbilities", []);
    setChecks("linkArrows", []);
  }

  function previewText(card) {
    if (!card) return "Create or select a card to preview it.";

    const sections = [];
    if (card.pendulumEffect) sections.push(`Pendulum Effect:\n${card.pendulumEffect}`);
    if (card.text) sections.push(`${card.pendulumEffect ? "Effect Text:\n" : ""}${card.text}`);
    return sections.join("\n\n") || "No card text has been added yet.";
  }

  function normaliseTags(tags) {
    return normaliseList(tags);
  }

  function normaliseList(value) {
    if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
    if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
    return [];
  }

  function valueText(value) {
    return value === undefined || value === null ? "" : String(value);
  }

  function normaliseCardKind(value) {
    const text = String(value || "").toLowerCase();
    if (text.includes("spell")) return "spell";
    if (text.includes("trap")) return "trap";
    return "monster";
  }

  function defaultTypeForKind(cardKind) {
    if (cardKind === "spell") return "Spell Card";
    if (cardKind === "trap") return "Trap Card";
    return "Monster";
  }

  function updateTypeForKind(monsterMode) {
    const currentType = dom.type.value.trim();
    const simpleTypes = ["", "Monster", "Spell Card", "Trap Card"];
    if (!simpleTypes.includes(currentType)) return;
    dom.type.value = monsterMode ? "Monster" : defaultTypeForKind(dom.cardKind.value);
  }

  function splitPendulumDescription(text) {
    const value = String(text || "");
    const pendulumMatch = value.match(/\[\s*Pendulum Effect\s*\]([\s\S]*?)(?:-{3,}|\[\s*Monster Effect\s*\])/i);
    const monsterMatch = value.match(/\[\s*Monster Effect\s*\]([\s\S]*)/i);

    return {
      pendulum: cleanupEffectText(pendulumMatch ? pendulumMatch[1] : ""),
      monster: cleanupEffectText(monsterMatch ? monsterMatch[1] : "")
    };
  }

  function cleanupEffectText(text) {
    return String(text || "").replace(/^-{3,}/, "").trim();
  }

  function inferAbilities(type) {
    const text = String(type || "");
    return ["Tuner", "Flip", "Toon", "Spirit", "Gemini", "Union", "Pendulum", "Ritual"]
      .filter((ability) => text.toLowerCase().includes(ability.toLowerCase()));
  }

  function getChecks(groupId) {
    return Array.from(dom[groupId].querySelectorAll('input[type="checkbox"]'));
  }

  function readChecks(groupId) {
    return getChecks(groupId).filter((input) => input.checked).map((input) => input.value);
  }

  function setChecks(groupId, values) {
    const selected = new Set(normaliseList(values));
    getChecks(groupId).forEach((input) => {
      input.checked = selected.has(input.value);
    });
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

  function smallButton(label, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", action);
    return button;
  }

  function formatFullDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function localDateTimeToIso(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }

  function isTypingTarget(target) {
    return ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName) || target?.isContentEditable;
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
