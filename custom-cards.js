(function () {
  const CARDS_PER_PAGE = 12;
  const DEFAULT_API_BASE_URL = "https://ccf-hub.theyellowlightsader.workers.dev";
  
  const state = {
    cards: [],
    filtered: [],
    selectedCardIndex: 0,
    source: "loading",
    currentPage: 1
  };

  function apiUrl(path) {
    const base = (window.CCF_API_CONFIG && window.CCF_API_CONFIG.apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
    return `${base}${path}`;
  }

  function normaliseTags(tags) {
    return normaliseList(tags);
  }

  function normaliseList(value) {
    if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
    if (typeof value === "string") {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
    return [];
  }

  function normaliseCardKind(card) {
    const value = String(card.cardKind || card.card_kind || card.frameType || card.frame_type || card.type || "").toLowerCase();
    if (value.includes("spell")) return "spell";
    if (value.includes("trap")) return "trap";
    return "monster";
  }

  function valueText(value) {
    return value === undefined || value === null ? "" : String(value);
  }

  function normaliseCard(card, index) {
    card = card || {};
    const cardKind = normaliseCardKind(card);
    const monsterMode = cardKind === "monster";
    const spellTrapProperty = monsterMode ? "" : (card.spellTrapProperty || card.spell_trap_property || card.race || "");
    const splitText = splitPendulumDescription(card.text || card.effect || card.description || "");
    const monsterAbilities = monsterMode ? normaliseList(card.monsterAbilities || card.monster_abilities || inferAbilities(card.type)) : [];
    const pendulumMode = monsterAbilities.includes("Pendulum");

    return {
      cardIndex: index,
      id: String(card.id || card.name || `card-${index}`),
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
      atk: monsterMode ? valueText(card.atk ?? "") : "",
      def: monsterMode ? valueText(card.def ?? "") : "",
      status: String(card.status || card.releaseStatus || "Released"),
      pendulumEffect: pendulumMode ? String(card.pendulumEffect || card.pendulum_effect || card.pend_desc || splitText.pendulum || "") : "",
      text: String(card.monsterText || card.monster_text || card.monster_desc || splitText.monster || card.text || card.effect || card.description || ""),
      image: String(card.image || card.imageUrl || card.img || ""),
      tags: normaliseTags(card.tags),
      monsterAbilities,
      linkArrows: monsterMode ? normaliseList(card.linkArrows || card.link_arrows || card.linkmarkers) : [],
      updatedAt: String(card.updatedAt || "")
    };
  }

  function normaliseDatabase(payload) {
    const list = Array.isArray(payload) ? payload : payload?.cards;
    if (!Array.isArray(list)) return null;
    return list.map(normaliseCard);
  }

  function matches(card, query) {
    if (!query) return true;
    const haystack = [
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
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  }

  function compareCards(a, b, sortMode) {
    if (sortMode === "release") {
      return a.cardIndex - b.cardIndex;
    }
    if (sortMode === "type") {
      return a.type.localeCompare(b.type) || a.name.localeCompare(b.name);
    }
    if (sortMode === "status") {
      return a.status.localeCompare(b.status) || a.name.localeCompare(b.name);
    }
    return a.name.localeCompare(b.name);
  }

  function uniqueValues(key) {
    return Array.from(new Set(state.cards.map((card) => card[key]).filter(Boolean))).sort();
  }

  function populateSelect(select, values, allLabel) {
    const current = select.value;
    select.innerHTML = "";
    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = allLabel;
    select.appendChild(allOption);
    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
    select.value = values.includes(current) ? current : "all";
  }

  function buildImage(src, alt, className, container) {
    container.classList.toggle("missing", !src);
    container.innerHTML = "";
    if (!src) return;

    const img = document.createElement("img");
    img.className = className;
    img.src = src;
    img.alt = alt;
    img.loading = "lazy";
    img.onerror = function () {
      container.classList.add("missing");
      img.remove();
    };
    container.appendChild(img);
  }

  function pill(text, className) {
    const span = document.createElement("span");
    span.className = `pill ${className || ""}`.trim();
    span.textContent = text;
    return span;
  }

  function renderCard(card) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "card-result";
    button.classList.toggle("active", card.cardIndex === state.selectedCardIndex);
    button.setAttribute("data-card-index", card.cardIndex);
    
    button.addEventListener("click", function (e) {
      e.preventDefault();
      state.selectedCardIndex = card.cardIndex;
      updateCardDisplay();
    });

    const art = document.createElement("div");
    art.className = "card-art";
    buildImage(card.image, card.name, "", art);

    const body = document.createElement("div");
    body.className = "card-body";

    const name = document.createElement("div");
    name.className = "card-name";
    name.textContent = card.name;

    const text = document.createElement("div");
    text.className = "card-text";
    text.textContent = card.pendulumEffect ? `Pendulum Effect: ${card.pendulumEffect}` : card.text || "No effect text added yet.";

    const pills = document.createElement("div");
    pills.className = "pill-row";
    pills.appendChild(pill(card.type, "gold"));
    if (card.spellTrapProperty) pills.appendChild(pill(card.spellTrapProperty, "aqua"));
    if (card.monsterAbilities.length) pills.appendChild(pill(card.monsterAbilities.join(" / "), "aqua"));
    if (card.status) pills.appendChild(pill(card.status, "aqua"));

    body.append(name, pills, text);
    button.append(art, body);
    return button;
  }

  function updateCardDisplay() {
    // Update active state on all card buttons
    document.querySelectorAll(".card-result").forEach((btn) => {
      btn.classList.remove("active");
    });
    const activeBtn = document.querySelector(`[data-card-index="${state.selectedCardIndex}"]`);
    if (activeBtn) {
      activeBtn.classList.add("active");
    }

    // Update detail panel
    const selectedCard = state.cards[state.selectedCardIndex];
    renderDetail(selectedCard);
  }

  function renderDetail(card) {
    const detail = document.getElementById("cardDetail");
    detail.innerHTML = "";

    if (!card) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "Select a card to view its full details.";
      detail.appendChild(empty);
      return;
    }

    const art = document.createElement("div");
    art.className = "detail-art";
    buildImage(card.image, card.name, "", art);

    const content = document.createElement("div");
    content.className = "detail-content";

    const title = document.createElement("h2");
    title.textContent = card.name;

    const pills = document.createElement("div");
    pills.className = "pill-row";
    pills.appendChild(pill(card.type, "gold"));
    if (card.attribute) pills.appendChild(pill(card.attribute, "aqua"));
    if (card.spellTrapProperty) pills.appendChild(pill(card.spellTrapProperty, "aqua"));
    if (card.monsterAbilities.length) pills.appendChild(pill(card.monsterAbilities.join(" / "), "aqua"));
    if (card.status) pills.appendChild(pill(card.status, "rose"));

    const pendulumEffect = document.createElement("p");
    pendulumEffect.className = "lead effect-block";
    pendulumEffect.textContent = `Pendulum Effect:\n${card.pendulumEffect}`;

    const effect = document.createElement("p");
    effect.className = "lead effect-block";
    effect.textContent = `${card.pendulumEffect ? "Effect Text:\n" : ""}${card.text || "No card text has been added yet."}`;

    const meta = document.createElement("dl");
    [
      ["Race", card.race],
      ["Level", card.level],
      ["Pendulum Scale", card.pendulumScale],
      ["Link Rating", card.linkRating],
      ["Link Arrows", card.linkArrows.join(", ")],
      ["ATK", card.atk],
      ["DEF", card.def],
      ["Source", card.source],
      ["Official ID", card.officialId],
      ["Tags", card.tags.join(", ")]
    ].forEach(([label, value]) => {
      if (!value) return;
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value;
      meta.append(dt, dd);
    });

    content.append(title, pills);
    if (card.pendulumEffect) content.appendChild(pendulumEffect);
    content.append(effect, meta);
    detail.append(art, content);
  }

  function inferAbilities(type) {
    const text = String(type || "").toLowerCase();
    return ["Tuner", "Flip", "Toon", "Spirit", "Gemini", "Union", "Pendulum", "Ritual"]
      .filter((ability) => text.includes(ability.toLowerCase()));
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

  function renderPagination() {
    const totalPages = Math.ceil(state.filtered.length / CARDS_PER_PAGE);
    const paginationContainer = document.getElementById("cardPagination");
    
    if (!paginationContainer) return;
    
    paginationContainer.innerHTML = "";
    
    if (totalPages <= 1) {
      paginationContainer.style.display = "none";
      return;
    }
    
    paginationContainer.style.display = "flex";
    
    // Previous button
    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "pagination-btn";
    prevBtn.textContent = "← Previous";
    prevBtn.disabled = state.currentPage === 1;
    prevBtn.addEventListener("click", () => {
      if (state.currentPage > 1) {
        state.currentPage--;
        const grid = document.getElementById("cardResults");
        const startIndex = (state.currentPage - 1) * CARDS_PER_PAGE;
        const paginatedCards = state.filtered.slice(startIndex, startIndex + CARDS_PER_PAGE);
        grid.innerHTML = "";
        paginatedCards.forEach((card) => grid.appendChild(renderCard(card)));
        renderPagination();
        document.querySelector(".page-info").textContent = `Page ${state.currentPage} of ${totalPages}`;
      }
    });
    paginationContainer.appendChild(prevBtn);
    
    // Page info
    const pageInfo = document.createElement("span");
    pageInfo.className = "page-info";
    pageInfo.textContent = `Page ${state.currentPage} of ${totalPages}`;
    paginationContainer.appendChild(pageInfo);
    
    // Next button
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "pagination-btn";
    nextBtn.textContent = "Next →";
    nextBtn.disabled = state.currentPage === totalPages;
    nextBtn.addEventListener("click", () => {
      if (state.currentPage < totalPages) {
        state.currentPage++;
        const grid = document.getElementById("cardResults");
        const startIndex = (state.currentPage - 1) * CARDS_PER_PAGE;
        const paginatedCards = state.filtered.slice(startIndex, startIndex + CARDS_PER_PAGE);
        grid.innerHTML = "";
        paginatedCards.forEach((card) => grid.appendChild(renderCard(card)));
        renderPagination();
        document.querySelector(".page-info").textContent = `Page ${state.currentPage} of ${totalPages}`;
      }
    });
    paginationContainer.appendChild(nextBtn);
  }

  function render() {
    const query = document.getElementById("cardSearch").value.trim().toLowerCase();
    const type = document.getElementById("typeFilter").value;
    const status = document.getElementById("statusFilter").value;
    const sortMode = document.getElementById("sortCards").value;
    const grid = document.getElementById("cardResults");
    const count = document.getElementById("resultCount");
    const statusText = document.getElementById("databaseStatus");

    state.filtered = state.cards
      .filter((card) => matches(card, query))
      .filter((card) => type === "all" || card.type === type)
      .filter((card) => status === "all" || card.status === status)
      .sort((a, b) => compareCards(a, b, sortMode));

    // Check if selected card is in filtered results
    if (!state.filtered.some((card) => card.cardIndex === state.selectedCardIndex)) {
      state.selectedCardIndex = state.filtered[0]?.cardIndex || 0;
    }

    // Calculate pagination safety boundaries
    const totalPages = Math.ceil(state.filtered.length / CARDS_PER_PAGE);
    if (state.currentPage > totalPages) {
      state.currentPage = Math.max(1, totalPages);
    }

    const startIndex = (state.currentPage - 1) * CARDS_PER_PAGE;
    const endIndex = startIndex + CARDS_PER_PAGE;
    const paginatedCards = state.filtered.slice(startIndex, endIndex);

    grid.innerHTML = "";
    paginatedCards.forEach((card) => grid.appendChild(renderCard(card)));

    if (state.filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = state.cards.length === 0
        ? "No custom cards have been added yet."
        : "No cards match that search.";
      grid.appendChild(empty);
    }

    const total = state.cards.length;
    count.textContent = `${state.filtered.length} of ${total} cards`;
    statusText.textContent = state.source === "not-connected"
      ? "Cloudflare API is not connected yet."
      : "Live custom-card database";

    const selectedCard = state.cards[state.selectedCardIndex];
    renderDetail(selectedCard);
    renderPagination();
  }

  function hydrateFilters() {
    populateSelect(document.getElementById("typeFilter"), uniqueValues("type"), "All types");
    populateSelect(document.getElementById("statusFilter"), uniqueValues("status"), "All statuses");
  }

  async function fetchCards() {
    const loader = document.getElementById("cardLoadState");
    loader.textContent = "Loading custom-card database...";

    try {
      const response = await fetch(apiUrl("/api/database"), {
        headers: { "Accept": "application/json" }
      });

      if (!response.ok) {
        throw new Error(`Cloudflare API returned ${response.status}`);
      }

      const data = await response.json();
      const cards = normaliseDatabase(data);

      if (!cards) {
        throw new Error("No cards array found");
      }

      state.cards = cards;
      state.source = "live";
      loader.style.display = "none";
      hydrateFilters();
      render();
    } catch (error) {
      state.cards = [];
      state.source = "error";
      loader.className = "notice danger";
      loader.textContent = `Could not load Cloudflare data: ${error.message}.`;
      hydrateFilters();
      render();
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    ["cardSearch", "typeFilter", "statusFilter", "sortCards"].forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener("input", () => {
          state.currentPage = 1; // Only reset pages when structural parameters change
          render();
        });
        element.addEventListener("change", () => {
          state.currentPage = 1; // Only reset pages when structural parameters change
          render();
        });
      }
    });
    fetchCards();
  });
})();
