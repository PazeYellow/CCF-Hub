(function () {
  const DEFAULT_API_BASE_URL = "https://ccf-hub.theyellowlightsader.workers.dev";
  const STATUS_LABELS = {
    forbidden: "Forbidden",
    limited: "Limited",
    semi_limited: "Semi-Limited"
  };

  let banlistData = { forbidden: [], limited: [], semi_limited: [] };
  let currentTab = "forbidden";

  function apiUrl(path) {
    const base = (window.CCF_API_CONFIG && window.CCF_API_CONFIG.apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
    return `${base}${path}`;
  }

  function normaliseCard(card) {
    return {
      name: String(card.name || "Unnamed Card"),
      type: String(card.type || "Card"),
      image: String(card.image || card.imageUrl || "")
    };
  }

  async function fetchBanlist() {
    const loader = document.getElementById("loader");
    try {
      const response = await fetch(apiUrl("/api/banlist"), {
        headers: { "Accept": "application/json" }
      });
      if (!response.ok) throw new Error(`Cloudflare API returned ${response.status}`);

      const record = await response.json();
      banlistData = {
        forbidden: Array.isArray(record.forbidden) ? record.forbidden.map(normaliseCard) : [],
        limited: Array.isArray(record.limited) ? record.limited.map(normaliseCard) : [],
        semi_limited: Array.isArray(record.semi_limited) ? record.semi_limited.map(normaliseCard) : []
      };

      loader.style.display = "none";
      updateCounts();
      renderGrid();
    } catch (error) {
      loader.style.display = "";
      loader.className = "notice danger";
      loader.textContent = `Failed to load banlist data: ${error.message}`;
    }
  }

  function updateCounts() {
    document.getElementById("count-forbidden").textContent = banlistData.forbidden.length;
    document.getElementById("count-limited").textContent = banlistData.limited.length;
    document.getElementById("count-semi_limited").textContent = banlistData.semi_limited.length;
  }

  function buildImage(card, container) {
    container.classList.toggle("missing", !card.image);
    container.innerHTML = "";
    if (!card.image) return;

    const img = document.createElement("img");
    img.src = card.image;
    img.alt = card.name;
    img.loading = "lazy";
    img.onerror = function () {
      container.classList.add("missing");
      img.remove();
    };
    container.appendChild(img);
  }

  function renderGrid() {
    const container = document.getElementById("banlist-content");
    const searchQuery = document.getElementById("search").value.trim().toLowerCase();
    const activeCards = banlistData[currentTab] || [];
    const filteredCards = activeCards.filter((card) => card.name.toLowerCase().includes(searchQuery));

    container.innerHTML = "";
    document.getElementById("visibleCount").textContent = `${filteredCards.length} of ${activeCards.length} cards`;
    document.getElementById("banlistStatus").textContent = STATUS_LABELS[currentTab];

    if (filteredCards.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No cards found in this section.";
      container.appendChild(empty);
      return;
    }

    filteredCards.forEach((card) => {
      const item = document.createElement("article");
      item.className = "ban-card";

      const art = document.createElement("div");
      art.className = "card-art";
      buildImage(card, art);

      const body = document.createElement("div");
      body.className = "card-body";

      const badge = document.createElement("span");
      badge.className = `ban-badge ${currentTab}`;
      badge.textContent = STATUS_LABELS[currentTab];

      const name = document.createElement("div");
      name.className = "card-name";
      name.textContent = card.name;

      const type = document.createElement("div");
      type.className = "card-text";
      type.textContent = card.type;

      body.append(badge, name, type);
      item.append(art, body);
      container.appendChild(item);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".status-tab").forEach((button) => {
      button.addEventListener("click", function () {
        document.querySelectorAll(".status-tab").forEach((btn) => btn.classList.remove("active"));
        button.classList.add("active");
        currentTab = button.getAttribute("data-status");
        renderGrid();
      });
    });

    document.getElementById("search").addEventListener("input", renderGrid);
    fetchBanlist();
  });
})();
