(function () {
  const CARDS_PER_PAGE = 12;
  
  const state = {
    cards: [],
    filtered: [],
    selectedId: "",
    source: "loading",
    currentPage: 1
  };

  const config = window.CCF_CUSTOM_CARD_CONFIG || {};

  function ready() {
    return Boolean(
      config.binId &&
      config.readOnlyKey &&
      !config.binId.includes("PASTE_") &&
      !config.readOnlyKey.includes("PASTE_")
    );
  }

  function normaliseTags(tags) {
    if (Array.isArray(tags)) return tags.map(String).filter(Boolean);
    if (typeof tags === "string") {
      return tags.split(",").map((tag) => tag.trim()).filter(Boolean);
    }
    return [];
  }

  function normaliseCard(card, index) {
    card = card || {};
    return {
      id: String(card.id || card.name || `card-${index}`),
      name: String(card.name || "Unnamed Card"),
      type: String(card.type || card.cardType || "Card"),
      attribute: String(card.attribute || ""),
      race: String(card.race || card.subtype || ""),
      level: String(card.level || card.rank || card.linkRating || ""),
      atk: String(card.atk || ""),
      def: String(card.def || ""),
      status: String(card.status || card.releaseStatus || "Released"),
      text: String(card.text || card.effect || card.description || ""),
      image: String(card.image || card.imageUrl || card.img || ""),
      tags: normaliseTags(card.tags),
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
      card.attribute,
      card.race,
      card.status,
      card.text,
      card.tags.join(" ")
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  }

  function compareCards(a, b, sortMode) {
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
    button.classList.toggle("active", card.id === state.selectedId);
    button.setAttribute("data-card-id", card.id);
    button.addEventListener("click", function (e) {
      e.preventDefault();
      state.selectedId = card.id;
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
    text.textContent = card.text || "No effect text added yet.";

    const pills = document.createElement("div");
    pills.className = "pill-row";
    pills.appendChild(pill(card.type, "gold"));
    if (card.status) pills.appendChild(pill(card.status, "aqua"));

    body.append(name, pills, text);
    button.append(art, body);
    return button;
  }

  function updateCardDisplay() {
    // Update active state on all cards
    document.querySelectorAll(".card-result").forEach((btn) => {
      btn.classList.remove("active");
    });
    const activeBtn = document.querySelector(`[data-card-id="${state.selectedId}"]`);
    if (activeBtn) {
      activeBtn.classList.add("active");
    }

    // Update detail panel
    const selectedCard = state.cards.find((card) => card.id === state.selectedId);
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
    if (card.status) pills.appendChild(pill(card.status, "rose"));

    const effect = document.createElement("p");
    effect.className = "lead";
    effect.textContent = card.text || "No card text has been added yet.";

    const meta = document.createElement("dl");
    [
      ["Race", card.race],
      ["Level", card.level],
      ["ATK", card.atk],
      ["DEF", card.def],
      ["Tags", card.tags.join(", ")]
    ].forEach(([label, value]) => {
      if (!value) return;
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value;
      meta.append(dt, dd);
    });

    content.append(title, pills, effect, meta);
    detail.append(art, content);
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
        render();
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
        render();
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

    // Reset to page 1 if filters change
    state.currentPage = 1;

    if (!state.selectedId || !state.filtered.some((card) => card.id === state.selectedId)) {
      state.selectedId = state.filtered[0]?.id || "";
    }

    // Calculate pagination
    const totalPages = Math.ceil(state.filtered.length / CARDS_PER_PAGE);
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
      ? "Custom-card database is not connected yet."
      : "Live custom-card database";

    const selectedCard = state.cards.find((card) => card.id === state.selectedId);
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

    if (!ready()) {
      state.cards = [];
      state.source = "not-connected";
      loader.className = "notice";
      loader.textContent = "Custom-card JSONBin is not connected yet. Fill in custom-cards-config.js with the new bin ID and read-only access key.";
      hydrateFilters();
      render();
      return;
    }

    try {
      const authHeader = config.authHeader || "X-Access-Key";
      const response = await fetch(`https://api.jsonbin.io/v3/b/${encodeURIComponent(config.binId)}/latest`, {
        headers: {
          [authHeader]: config.readOnlyKey
        }
      });

      if (!response.ok) {
        throw new Error(`JSONBin returned ${response.status}`);
      }

      const data = await response.json();
      const cards = normaliseDatabase(data.record || data);

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
      loader.textContent = `Could not load JSONBin data: ${error.message}.`;
      hydrateFilters();
      render();
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    ["cardSearch", "typeFilter", "statusFilter", "sortCards"].forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener("input", render);
        element.addEventListener("change", render);
      }
    });
    fetchCards();
  });
})();
