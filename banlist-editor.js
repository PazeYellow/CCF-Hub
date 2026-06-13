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
    selectedOrderIndexes: new Set(),
    orderDirty: false,
    requests: [],
    chatMessages: [],
    users: [],
    officialSearchTimer: null
  };

  const dom = {};

  document.addEventListener("DOMContentLoaded", function () {
    [
      "authPanel", "authMessage", "adminWorkspace", "loginEmail", "loginPassword", "loginButton", "forgotPasswordButton",
      "signupName", "signupEmail", "signupPassword", "signupRole", "signupButton", "sessionMeta",
      "sessionRole", "sessionAvatar", "profileDisplayName", "profileColor", "profileAvatarUrl",
      "profileBio", "saveProfileButton", "currentPassword", "newPassword", "changePasswordButton", "logoutButton",
      "banSearch", "banStatusFilter", "banCardList", "banEditorStatus", "banEditorCount",
      "moveBanCardUp", "moveBanCardDown", "sortSelectedBanCards", "clearBanSelection", "saveBanOrder",
      "banSelectionCount", "banOrderState", "banFormArt", "banFormBadge", "banFormName", "banFormType",
      "banPreviewTitle", "banPreviewCount", "banVisualPreview",
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
    dom.forgotPasswordButton.addEventListener("click", forgotPassword);
    dom.signupButton.addEventListener("click", signup);
    dom.logoutButton.addEventListener("click", logout);
    dom.saveProfileButton.addEventListener("click", saveProfile);
    dom.changePasswordButton.addEventListener("click", changePassword);
    dom.officialCardSearch.addEventListener("input", queueOfficialCardSearch);
    dom.banSearch.addEventListener("input", renderBanlist);
    dom.banStatusFilter.addEventListener("change", function () {
      state.selectedStatus = dom.banStatusFilter.value;
      state.selectedIndex = -1;
      state.selectedOrderIndexes.clear();
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
    dom.moveBanCardUp.addEventListener("click", () => moveBanCards(-1));
    dom.moveBanCardDown.addEventListener("click", () => moveBanCards(1));
    dom.sortSelectedBanCards.addEventListener("click", sortSelectedBanCards);
    dom.clearBanSelection.addEventListener("click", clearBanSelection);
    dom.saveBanOrder.addEventListener("click", saveBanOrder);
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

    [dom.cardName, dom.cardType, dom.cardImage, dom.cardStatus].forEach((input) => {
      input.addEventListener("input", renderFormPreview);
      input.addEventListener("change", renderFormPreview);
    });

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

  async function forgotPassword() {
    const email = dom.loginEmail.value.trim();
    setNotice(dom.authMessage, "");

    if (!email) {
      setNotice(dom.authMessage, "Enter your email first, then request a reset.", true);
      return;
    }

    dom.forgotPasswordButton.disabled = true;
    try {
      await window.CCF_API.request("/api/auth/forgot-password", {
        method: "POST",
        body: { email }
      });
      setNotice(dom.authMessage, "Password reset request sent to the owners.");
    } catch (error) {
      setNotice(dom.authMessage, error.message, true);
    } finally {
      dom.forgotPasswordButton.disabled = false;
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
    state.selectedOrderIndexes.clear();
    state.orderDirty = false;
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
    const accountsTab = document.querySelector('[data-admin-tab="accounts"]');
    if (accountsTab) accountsTab.textContent = "Accounts";
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

    pruneSelectedIndexes(cards.length);
    dom.banCardList.innerHTML = "";
    dom.banEditorCount.textContent = `${filtered.length} of ${cards.length} cards`;
    renderOrderState(cards.length);
    renderVisualPreview(status, cards);
    renderFormPreview();

    if (!filtered.length) {
      dom.banCardList.innerHTML = '<div class="empty-state">No cards found.</div>';
      return;
    }

    filtered.forEach(({ card, index }) => {
      const item = document.createElement("article");
      item.className = "visual-ban-row";
      item.classList.toggle("active", state.selectedStatus === status && state.selectedIndex === index);
      item.classList.toggle("selected", state.selectedOrderIndexes.has(index));

      const picker = document.createElement("label");
      picker.className = "ban-row-picker";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = state.selectedOrderIndexes.has(index);
      checkbox.addEventListener("change", function () {
        toggleOrderSelection(index);
      });
      picker.appendChild(checkbox);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "ban-row-card";

      const art = document.createElement("span");
      art.className = "official-card-thumb";
      buildImage(card.image, card.name, art);

      const body = document.createElement("span");
      body.innerHTML = `
        <strong>${escapeHtml(card.name)}</strong>
        <small>${escapeHtml(card.type || "Card")}</small>
        <small>#${index + 1}</small>
      `;

      button.append(art, body);
      button.addEventListener("click", function () {
        state.selectedStatus = status;
        state.selectedIndex = index;
        showCard(card, status);
        renderBanlist();
      });

      item.append(picker, button);
      dom.banCardList.appendChild(item);
    });
  }

  function buildImage(src, alt, container) {
    container.classList.toggle("missing", !src);
    container.innerHTML = "";
    if (!src) return;

    const img = document.createElement("img");
    img.src = src;
    img.alt = alt || "";
    img.loading = "lazy";
    img.onerror = function () {
      container.classList.add("missing");
      img.remove();
    };
    container.appendChild(img);
  }

  function renderOrderState(cardCount) {
    const selectedCount = state.selectedOrderIndexes.size;
    dom.banSelectionCount.textContent = `${selectedCount} selected`;
    dom.banOrderState.textContent = state.orderDirty ? "Unsaved order" : "Saved order";
    dom.banOrderState.classList.toggle("dirty-text", state.orderDirty);

    const hasCards = cardCount > 0;
    const hasSelection = selectedCount > 0 || state.selectedIndex >= 0;
    dom.moveBanCardUp.disabled = !isOwner() || !hasCards || !hasSelection;
    dom.moveBanCardDown.disabled = !isOwner() || !hasCards || !hasSelection;
    dom.sortSelectedBanCards.disabled = !isOwner() || selectedCount < 2;
    dom.clearBanSelection.disabled = selectedCount === 0;
    dom.saveBanOrder.disabled = !isOwner() || !state.orderDirty;
  }

  function renderFormPreview() {
    const card = {
      name: dom.cardName.value.trim() || "No card selected",
      type: dom.cardType.value.trim() || "Card",
      image: dom.cardImage.value.trim()
    };
    const status = dom.cardStatus.value || state.selectedStatus;

    buildImage(card.image, card.name, dom.banFormArt);
    dom.banFormBadge.className = `ban-badge ${status}`;
    dom.banFormBadge.textContent = STATUS_LABELS[status] || "Banlist";
    dom.banFormName.textContent = card.name;
    dom.banFormType.textContent = card.type;
  }

  function renderVisualPreview(status, cards) {
    dom.banPreviewTitle.textContent = `${STATUS_LABELS[status]} Preview`;
    dom.banPreviewCount.textContent = `${cards.length} cards`;
    dom.banVisualPreview.innerHTML = "";

    if (!cards.length) {
      dom.banVisualPreview.innerHTML = '<div class="empty-state">No cards in this section.</div>';
      return;
    }

    cards.forEach((card, index) => {
      const item = document.createElement("article");
      item.className = "ban-card";
      item.classList.toggle("selected", state.selectedOrderIndexes.has(index));

      const art = document.createElement("div");
      art.className = "card-art";
      buildImage(card.image, card.name, art);

      const body = document.createElement("div");
      body.className = "card-body";

      const badge = document.createElement("span");
      badge.className = `ban-badge ${status}`;
      badge.textContent = STATUS_LABELS[status];

      const name = document.createElement("div");
      name.className = "card-name";
      name.textContent = card.name;

      const type = document.createElement("div");
      type.className = "card-text";
      type.textContent = card.type;

      body.append(badge, name, type);
      item.append(art, body);
      dom.banVisualPreview.appendChild(item);
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
    const resetCount = state.users.filter((user) => user.passwordResetRequestedAt).length;
    const accountsTab = document.querySelector('[data-admin-tab="accounts"]');
    if (accountsTab) accountsTab.textContent = resetCount ? `Accounts (${resetCount})` : "Accounts";

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
          ${user.passwordResetRequestedAt ? `<p class="reset-request-text">Password reset requested ${escapeHtml(formatDate(user.passwordResetRequestedAt))}</p>` : ""}
        </div>
        <span class="pill ${user.status === "active" ? "aqua" : user.status === "pending" ? "gold" : "rose"}">${user.role} / ${user.status}</span>
      `;

      const actions = document.createElement("div");
      actions.className = "action-row";
      actions.append(
        userButton("Approve Admin", () => updateUser(user.id, { role: "admin", status: "active" })),
        userButton("Approve Owner", () => updateUser(user.id, { role: "owner", status: "active" })),
        userButton("Reset Password", () => resetUserPassword(user)),
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

  function toggleOrderSelection(index) {
    if (state.selectedOrderIndexes.has(index)) {
      state.selectedOrderIndexes.delete(index);
    } else {
      state.selectedOrderIndexes.add(index);
    }
    renderBanlist();
  }

  function clearBanSelection() {
    state.selectedOrderIndexes.clear();
    renderBanlist();
  }

  function pruneSelectedIndexes(cardCount) {
    state.selectedOrderIndexes = new Set(
      Array.from(state.selectedOrderIndexes).filter((index) => index >= 0 && index < cardCount)
    );
  }

  function actionIndexes() {
    const selected = Array.from(state.selectedOrderIndexes).sort((a, b) => a - b);
    if (selected.length) return selected;
    return state.selectedIndex >= 0 ? [state.selectedIndex] : [];
  }

  function moveBanCards(direction) {
    if (!isOwner()) return;
    const cards = state.banlist[state.selectedStatus] || [];
    const indexes = actionIndexes();

    if (!indexes.length) {
      setNotice(dom.editorMessage, "Select a card first.", true);
      return;
    }

    const activeCard = cards[state.selectedIndex] || null;
    let selected = new Set(indexes);

    if (direction < 0) {
      for (let index = 1; index < cards.length; index += 1) {
        if (selected.has(index) && !selected.has(index - 1)) {
          [cards[index - 1], cards[index]] = [cards[index], cards[index - 1]];
          selected.delete(index);
          selected.add(index - 1);
        }
      }
    } else {
      for (let index = cards.length - 2; index >= 0; index -= 1) {
        if (selected.has(index) && !selected.has(index + 1)) {
          [cards[index + 1], cards[index]] = [cards[index], cards[index + 1]];
          selected.delete(index);
          selected.add(index + 1);
        }
      }
    }

    state.selectedOrderIndexes = selected;
    if (activeCard) state.selectedIndex = cards.indexOf(activeCard);
    markOrderDirty();
    renderBanlist();
  }

  function sortSelectedBanCards() {
    if (!isOwner()) return;
    const cards = state.banlist[state.selectedStatus] || [];
    const indexes = Array.from(state.selectedOrderIndexes).sort((a, b) => a - b);

    if (indexes.length < 2) {
      setNotice(dom.editorMessage, "Select at least two cards to sort.", true);
      return;
    }

    const activeCard = cards[state.selectedIndex] || null;
    const sortedCards = indexes
      .map((index) => cards[index])
      .sort((a, b) => a.name.localeCompare(b.name));

    indexes.forEach((index, position) => {
      cards[index] = sortedCards[position];
    });

    if (activeCard) state.selectedIndex = cards.indexOf(activeCard);
    markOrderDirty();
    renderBanlist();
  }

  async function saveBanOrder() {
    if (!isOwner() || !state.orderDirty) return;
    await publishBanlist(cloneBanlist(), "Banlist order saved.");
  }

  function markOrderDirty() {
    state.orderDirty = true;
    setNotice(dom.editorMessage, "Order changed. Save the order when it looks right.");
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

  async function resetUserPassword(user) {
    if (!isOwner()) return;
    if (!confirm(`Reset password for ${user.email}?`)) return;

    try {
      const data = await window.CCF_API.request(`/api/admin/users/${user.id}/reset-password`, {
        method: "POST",
        body: {}
      });
      await loadUsers();
      setNotice(dom.editorMessage, `Temporary password for ${user.email}: ${data.temporaryPassword}`);
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

  async function publishBanlist(next, message) {
    try {
      const data = await window.CCF_API.request("/api/admin/banlist", {
        method: "PUT",
        body: { banlist: next }
      });
      state.banlist = normaliseBanlist(data.banlist);
      state.orderDirty = false;
      setNotice(dom.editorMessage, message || "Banlist saved.");
      renderBanlist();
      return true;
    } catch (error) {
      setNotice(dom.editorMessage, error.message, true);
      return false;
    }
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

    const saved = await publishBanlist(next, "Banlist saved.");
    if (saved) {
      state.selectedStatus = dom.cardStatus.value;
      dom.banStatusFilter.value = state.selectedStatus;
      state.selectedIndex = findCardIndex(state.banlist[state.selectedStatus], card.name);
      state.selectedOrderIndexes.clear();
      renderBanlist();
    }
  }

  async function deleteDirectly() {
    if (!isOwner() || state.selectedIndex < 0) return;
    const card = state.banlist[state.selectedStatus][state.selectedIndex];
    if (!confirm(`Delete "${card.name}" from the banlist?`)) return;

    const next = cloneBanlist();
    next[state.selectedStatus].splice(state.selectedIndex, 1);

    const saved = await publishBanlist(next, "Card deleted.");
    if (saved) {
      state.selectedIndex = -1;
      state.selectedOrderIndexes.clear();
      clearForm();
      renderBanlist();
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
    return banlist;
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
