(function () {
  const STATUSES = ["forbidden", "limited", "semi_limited"];
  const STATUS_LABELS = {
    forbidden: "Forbidden",
    limited: "Limited",
    semi_limited: "Semi-Limited"
  };

  const state = {
    user: null,
    banlist: { forbidden: [], limited: [], semi_limited: [] },
    selectedStatus: "forbidden",
    selectedIndex: -1,
    requests: [],
    chatMessages: [],
    users: [],
    officialSearchTimer: null
  };

  const dom = {};

  document.addEventListener("DOMContentLoaded", function () {
    [
      "authPanel", "authMessage", "adminWorkspace", "loginEmail", "loginPassword", "loginButton",
      "signupName", "signupEmail", "signupPassword", "signupRole", "signupButton", "sessionMeta",
      "sessionRole", "sessionAvatar", "profileDisplayName", "profileColor", "profileAvatarUrl",
      "profileBio", "saveProfileButton", "currentPassword", "newPassword", "changePasswordButton", "logoutButton",
      "banSearch", "banStatusFilter", "banCardList", "banEditorStatus", "banEditorCount",
      "officialCardSearch", "officialCardResults", "cardSource", "officialId", "cardName",
      "cardStatus", "cardType", "cardImage", "requestNote", "newBanCard",
      "saveBanCard", "deleteBanCard", "submitBanRequest", "editorMessage", "requestList",
      "refreshRequests", "chatMessages", "chatInput", "sendChatButton", "refreshChat",
      "userList", "refreshUsers"
    ].forEach((id) => {
      dom[id] = document.getElementById(id);
    });

    bindEvents();
    boot();
  });

  function bindEvents() {
    dom.loginButton.addEventListener("click", login);
    dom.signupButton.addEventListener("click", signup);
    dom.logoutButton.addEventListener("click", logout);
    dom.saveProfileButton.addEventListener("click", saveProfile);
    dom.changePasswordButton.addEventListener("click", changePassword);
    dom.officialCardSearch.addEventListener("input", queueOfficialCardSearch);
    dom.banSearch.addEventListener("input", renderBanlist);
    dom.banStatusFilter.addEventListener("change", function () {
      state.selectedStatus = dom.banStatusFilter.value;
      state.selectedIndex = -1;
      clearForm();
      renderBanlist();
    });
    dom.newBanCard.addEventListener("click", function () {
      state.selectedIndex = -1;
      clearForm();
      dom.cardStatus.value = state.selectedStatus;
      renderBanlist();
    });
    dom.saveBanCard.addEventListener("click", saveDirectly);
    dom.deleteBanCard.addEventListener("click", deleteDirectly);
    dom.submitBanRequest.addEventListener("click", submitRequest);
    dom.refreshRequests.addEventListener("click", loadRequests);
    dom.refreshChat.addEventListener("click", loadChat);
    dom.sendChatButton.addEventListener("click", sendChatMessage);
    dom.chatInput.addEventListener("keydown", function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        sendChatMessage();
      }
    });
    dom.refreshUsers.addEventListener("click", loadUsers);

    document.querySelectorAll("[data-admin-tab]").forEach((button) => {
      button.addEventListener("click", function () {
        showAdminTab(button.getAttribute("data-admin-tab"));
      });
    });
  }

  async function boot() {
    if (!window.CCF_API.token()) {
      showLoggedOut();
      return;
    }

    try {
      state.user = await window.CCF_API.me();
      await loadWorkspace();
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
      await loadWorkspace();
    } catch (error) {
      setNotice(dom.authMessage, error.message, true);
    }
  }

  async function signup() {
    setNotice(dom.authMessage, "");
    try {
      await window.CCF_API.request("/api/accounts/request", {
        method: "POST",
        body: {
          displayName: dom.signupName.value,
          email: dom.signupEmail.value,
          password: dom.signupPassword.value,
          requestedRole: dom.signupRole.value
        }
      });
      dom.signupPassword.value = "";
      setNotice(dom.authMessage, "Account request sent. An owner can approve it from the Accounts tab.");
    } catch (error) {
      setNotice(dom.authMessage, error.message, true);
    }
  }

  async function logout() {
    await window.CCF_API.logout();
    showLoggedOut();
  }

  async function changePassword() {
    setNotice(dom.editorMessage, "");
    try {
      await window.CCF_API.request("/api/auth/change-password", {
        method: "POST",
        body: {
          currentPassword: dom.currentPassword.value,
          newPassword: dom.newPassword.value
        }
      });
      dom.currentPassword.value = "";
      dom.newPassword.value = "";
      setNotice(dom.editorMessage, "Password changed.");
    } catch (error) {
      setNotice(dom.editorMessage, error.message, true);
    }
  }

  async function saveProfile() {
    setNotice(dom.editorMessage, "");
    try {
      const data = await window.CCF_API.request("/api/me/profile", {
        method: "PATCH",
        body: {
          displayName: dom.profileDisplayName.value,
          avatarUrl: dom.profileAvatarUrl.value,
          profileColor: dom.profileColor.value,
          bio: dom.profileBio.value
        }
      });
      state.user = data.user;
      renderProfile();
      setNotice(dom.editorMessage, "Profile saved.");
      if (isOwner()) await loadUsers();
    } catch (error) {
      setNotice(dom.editorMessage, error.message, true);
    }
  }

  async function loadWorkspace() {
    showLoggedIn();
    await loadBanlist();
    await loadRequests();
    await loadChat();
    if (isOwner()) await loadUsers();
  }

  async function loadBanlist() {
    state.banlist = normaliseBanlist(await window.CCF_API.request("/api/banlist"));
    state.selectedIndex = -1;
    clearForm();
    renderBanlist();
  }

  async function loadRequests() {
    try {
      const data = await window.CCF_API.request("/api/admin/banlist/requests");
      state.requests = data.requests || [];
      renderRequests();
    } catch (error) {
      setNotice(dom.editorMessage, error.message, true);
    }
  }

  async function loadChat() {
    try {
      const data = await window.CCF_API.request("/api/admin/chat?limit=80");
      state.chatMessages = data.messages || [];
      renderChat();
    } catch (error) {
      setNotice(dom.editorMessage, error.message, true);
    }
  }

  async function sendChatMessage() {
    const message = dom.chatInput.value.trim();
    if (!message) return;

    dom.sendChatButton.disabled = true;
    try {
      const data = await window.CCF_API.request("/api/admin/chat", {
        method: "POST",
        body: { message }
      });
      state.chatMessages.push(data.message);
      state.chatMessages = state.chatMessages.slice(-80);
      dom.chatInput.value = "";
      renderChat();
    } catch (error) {
      setNotice(dom.editorMessage, error.message, true);
    } finally {
      dom.sendChatButton.disabled = false;
    }
  }

  async function loadUsers() {
    if (!isOwner()) return;
    try {
      const data = await window.CCF_API.request("/api/admin/users");
      state.users = data.users || [];
      renderUsers();
    } catch (error) {
      setNotice(dom.editorMessage, error.message, true);
    }
  }

  function showLoggedOut(message) {
    state.user = null;
    dom.authPanel.classList.remove("hidden");
    dom.adminWorkspace.classList.add("hidden");
    setNotice(dom.authMessage, message || "");
  }

  function showLoggedIn() {
    dom.authPanel.classList.add("hidden");
    dom.adminWorkspace.classList.remove("hidden");
    renderProfile();
    document.querySelectorAll(".owner-only").forEach((element) => {
      element.classList.toggle("hidden", !isOwner());
    });
    dom.submitBanRequest.classList.toggle("hidden", isOwner());
  }

  function renderProfile() {
    const displayName = state.user.displayName || state.user.email;
    const color = state.user.profileColor || "#45d5c6";
    const avatarUrl = state.user.avatarUrl || "";

    dom.sessionMeta.textContent = `${displayName} (${state.user.email})`;
    dom.sessionRole.textContent = state.user.role;
    dom.sessionAvatar.style.backgroundColor = color;
    dom.sessionAvatar.style.backgroundImage = avatarUrl ? `url("${avatarUrl}")` : "";
    dom.sessionAvatar.textContent = avatarUrl ? "" : initials(displayName);

    dom.profileDisplayName.value = displayName;
    dom.profileColor.value = color;
    dom.profileAvatarUrl.value = avatarUrl;
    dom.profileBio.value = state.user.bio || "";
  }

  function showAdminTab(tab) {
    if (tab === "accounts" && !isOwner()) return;

    document.querySelectorAll("[data-admin-tab]").forEach((button) => {
      button.classList.toggle("active", button.getAttribute("data-admin-tab") === tab);
    });
    document.querySelectorAll(".admin-view").forEach((view) => view.classList.add("hidden"));
    document.getElementById(`${tab}View`).classList.remove("hidden");

    if (tab === "chat") {
      loadChat();
    }
  }

  function renderBanlist() {
    const status = dom.banStatusFilter.value;
    const cards = state.banlist[status] || [];
    const query = dom.banSearch.value.trim().toLowerCase();
    const filtered = cards
      .map((card, index) => ({ card, index }))
      .filter((item) => item.card.name.toLowerCase().includes(query));

    dom.banCardList.innerHTML = "";
    dom.banEditorCount.textContent = `${filtered.length} of ${cards.length} cards`;

    if (!filtered.length) {
      dom.banCardList.innerHTML = '<div class="empty-state">No cards found.</div>';
      return;
    }

    filtered.forEach(({ card, index }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = state.selectedStatus === status && state.selectedIndex === index ? "active" : "";
      button.textContent = card.name;
      button.addEventListener("click", function () {
        state.selectedStatus = status;
        state.selectedIndex = index;
        showCard(card, status);
        renderBanlist();
      });
      dom.banCardList.appendChild(button);
    });
  }

  function renderRequests() {
    dom.requestList.innerHTML = "";

    if (!state.requests.length) {
      dom.requestList.innerHTML = '<div class="empty-state">No banlist requests yet.</div>';
      return;
    }

    state.requests.forEach((request) => {
      const item = document.createElement("article");
      item.className = "admin-list-item";
      item.innerHTML = `
        <div>
          <strong>${escapeHtml(request.card.name)}</strong>
          <p>${request.action} to ${STATUS_LABELS[request.requestedStatus]} by ${escapeHtml(request.requesterName || request.requesterEmail || "staff")}</p>
          ${request.note ? `<p>${escapeHtml(request.note)}</p>` : ""}
        </div>
        <span class="pill ${request.status === "pending" ? "gold" : request.status === "approved" ? "aqua" : "rose"}">${request.status}</span>
      `;

      if (isOwner() && request.status === "pending") {
        const actions = document.createElement("div");
        actions.className = "action-row";

        const approve = document.createElement("button");
        approve.type = "button";
        approve.className = "primary";
        approve.textContent = "Approve";
        approve.addEventListener("click", () => reviewRequest(request.id, "approve"));

        const reject = document.createElement("button");
        reject.type = "button";
        reject.textContent = "Reject";
        reject.addEventListener("click", () => reviewRequest(request.id, "reject"));

        actions.append(approve, reject);
        item.appendChild(actions);
      }

      dom.requestList.appendChild(item);
    });
  }

  function renderUsers() {
    dom.userList.innerHTML = "";

    if (!state.users.length) {
      dom.userList.innerHTML = '<div class="empty-state">No accounts found.</div>';
      return;
    }

    state.users.forEach((user) => {
      const item = document.createElement("article");
      item.className = "admin-list-item";
      item.innerHTML = `
        <div>
          <div class="profile-chip">
            <span class="profile-avatar small" style="background-color: ${escapeHtml(user.profileColor || "#45d5c6")}; ${user.avatarUrl ? `background-image: url('${escapeHtml(user.avatarUrl)}')` : ""}">${user.avatarUrl ? "" : escapeHtml(initials(user.displayName || user.email))}</span>
            <strong>${escapeHtml(user.displayName || user.email)}</strong>
          </div>
          <p>${escapeHtml(user.email)}</p>
          ${user.bio ? `<p>${escapeHtml(user.bio)}</p>` : ""}
        </div>
        <span class="pill ${user.status === "active" ? "aqua" : user.status === "pending" ? "gold" : "rose"}">${user.role} / ${user.status}</span>
      `;

      const actions = document.createElement("div");
      actions.className = "action-row";
      actions.append(
        userButton("Approve Admin", () => updateUser(user.id, { role: "admin", status: "active" })),
        userButton("Approve Owner", () => updateUser(user.id, { role: "owner", status: "active" })),
        userButton("Disable", () => updateUser(user.id, { status: "disabled" })),
        userButton("Reject", () => updateUser(user.id, { status: "rejected" }))
      );

      item.appendChild(actions);
      dom.userList.appendChild(item);
    });
  }

  function renderChat() {
    dom.chatMessages.innerHTML = "";

    if (!state.chatMessages.length) {
      dom.chatMessages.innerHTML = '<div class="empty-state">No staff messages yet.</div>';
      return;
    }

    state.chatMessages.forEach((message) => {
      const item = document.createElement("article");
      item.className = "chat-message";
      const author = message.author || {};
      const displayName = author.displayName || author.email || "Staff";
      const color = author.profileColor || "#45d5c6";
      const avatarUrl = author.avatarUrl || "";
      item.innerHTML = `
        <span class="profile-avatar small" style="background-color: ${escapeHtml(color)}; ${avatarUrl ? `background-image: url('${escapeHtml(avatarUrl)}')` : ""}">${avatarUrl ? "" : escapeHtml(initials(displayName))}</span>
        <div>
          <div class="chat-message-meta">
            <strong>${escapeHtml(displayName)}</strong>
            <span>${formatDate(message.createdAt)}</span>
          </div>
          <p>${escapeHtml(message.message)}</p>
        </div>
      `;
      dom.chatMessages.appendChild(item);
    });

    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
  }

  function userButton(label, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", action);
    return button;
  }

  async function reviewRequest(id, decision) {
    try {
      await window.CCF_API.request(`/api/admin/banlist/requests/${id}/${decision}`, { method: "POST", body: {} });
      await loadBanlist();
      await loadRequests();
      setNotice(dom.editorMessage, decision === "approve" ? "Request approved." : "Request rejected.");
    } catch (error) {
      setNotice(dom.editorMessage, error.message, true);
    }
  }

  async function updateUser(id, patch) {
    try {
      await window.CCF_API.request(`/api/admin/users/${id}`, { method: "PATCH", body: patch });
      await loadUsers();
      setNotice(dom.editorMessage, "Account updated.");
    } catch (error) {
      setNotice(dom.editorMessage, error.message, true);
    }
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
    state.selectedIndex = -1;
    dom.cardSource.value = "official";
    dom.officialId.value = card.officialId || "";
    dom.cardName.value = card.name || "";
    dom.cardType.value = card.type || "Card";
    dom.cardImage.value = card.image || "";
    dom.banEditorStatus.textContent = card.name || "Official card";
    renderBanlist();
  }

  async function saveDirectly() {
    if (!isOwner()) return;
    const card = formCard();
    if (!card) return;

    const next = cloneBanlist();
    if (state.selectedIndex >= 0) {
      next[state.selectedStatus].splice(state.selectedIndex, 1);
    }
    next[dom.cardStatus.value].push(card);
    sortBanlist(next);

    try {
      const data = await window.CCF_API.request("/api/admin/banlist", {
        method: "PUT",
        body: { banlist: next }
      });
      state.banlist = normaliseBanlist(data.banlist);
      state.selectedStatus = dom.cardStatus.value;
      state.selectedIndex = findCardIndex(state.banlist[state.selectedStatus], card.name);
      renderBanlist();
      setNotice(dom.editorMessage, "Banlist saved.");
    } catch (error) {
      setNotice(dom.editorMessage, error.message, true);
    }
  }

  async function deleteDirectly() {
    if (!isOwner() || state.selectedIndex < 0) return;
    const card = state.banlist[state.selectedStatus][state.selectedIndex];
    if (!confirm(`Delete "${card.name}" from the banlist?`)) return;

    const next = cloneBanlist();
    next[state.selectedStatus].splice(state.selectedIndex, 1);

    try {
      const data = await window.CCF_API.request("/api/admin/banlist", {
        method: "PUT",
        body: { banlist: next }
      });
      state.banlist = normaliseBanlist(data.banlist);
      state.selectedIndex = -1;
      clearForm();
      renderBanlist();
      setNotice(dom.editorMessage, "Card deleted.");
    } catch (error) {
      setNotice(dom.editorMessage, error.message, true);
    }
  }

  async function submitRequest() {
    const card = formCard();
    if (!card) return;

    const body = {
      action: state.selectedIndex >= 0 ? "update" : "add",
      requestedStatus: dom.cardStatus.value,
      card,
      note: dom.requestNote.value
    };

    if (state.selectedIndex >= 0) {
      body.originalStatus = state.selectedStatus;
      body.originalName = state.banlist[state.selectedStatus][state.selectedIndex].name;
    }

    try {
      await window.CCF_API.request("/api/admin/banlist/requests", {
        method: "POST",
        body
      });
      dom.requestNote.value = "";
      await loadRequests();
      setNotice(dom.editorMessage, "Request sent to owners.");
    } catch (error) {
      setNotice(dom.editorMessage, error.message, true);
    }
  }

  function showCard(card, status) {
    dom.cardSource.value = card.source || "custom";
    dom.officialId.value = card.officialId || "";
    dom.cardName.value = card.name || "";
    dom.cardType.value = card.type || "Card";
    dom.cardImage.value = card.image || "";
    dom.cardStatus.value = status;
    dom.banEditorStatus.textContent = card.name || "No card selected";
  }

  function clearForm() {
    dom.cardSource.value = "custom";
    dom.officialId.value = "";
    dom.cardName.value = "";
    dom.cardType.value = "Card";
    dom.cardImage.value = "";
    dom.cardStatus.value = state.selectedStatus;
    dom.requestNote.value = "";
    dom.banEditorStatus.textContent = "New card";
  }

  function formCard() {
    const name = dom.cardName.value.trim();
    if (!name) {
      setNotice(dom.editorMessage, "Card name is required.", true);
      return null;
    }
    return {
      name,
      type: dom.cardType.value.trim() || "Card",
      image: dom.cardImage.value.trim(),
      source: dom.cardSource.value,
      officialId: dom.officialId.value.trim()
    };
  }

  function cloneBanlist() {
    return normaliseBanlist(JSON.parse(JSON.stringify(state.banlist)));
  }

  function normaliseBanlist(raw) {
    const banlist = { forbidden: [], limited: [], semi_limited: [] };
    STATUSES.forEach((status) => {
      banlist[status] = Array.isArray(raw && raw[status])
        ? raw[status].map((card) => ({
            name: String(card.name || "Unnamed Card"),
            type: String(card.type || "Card"),
            image: String(card.image || card.imageUrl || ""),
            source: String(card.source || "custom"),
            officialId: String(card.officialId || card.official_id || "")
          }))
        : [];
    });
    sortBanlist(banlist);
    return banlist;
  }

  function sortBanlist(banlist) {
    STATUSES.forEach((status) => {
      banlist[status].sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  function findCardIndex(cards, name) {
    return cards.findIndex((card) => card.name.toLowerCase() === name.toLowerCase());
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

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
})();
