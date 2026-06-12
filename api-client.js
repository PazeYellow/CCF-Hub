(function () {
  const TOKEN_KEY = "ccf_admin_token";
  const DEFAULT_API_BASE_URL = "https://ccf-hub.theyellowlightsader.workers.dev";

  function apiBase() {
    const configured = (window.CCF_API_CONFIG && window.CCF_API_CONFIG.apiBaseUrl || DEFAULT_API_BASE_URL).trim().replace(/\/+$/, "");
    if (!configured || configured.includes("YOUR-WORKER-SUBDOMAIN")) {
      throw new Error("Set apiBaseUrl in api-config.js after deploying the Cloudflare Worker.");
    }
    return configured;
  }

  function apiUrl(path) {
    return `${apiBase()}${path}`;
  }

  function token() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function setToken(value) {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  }

  async function request(path, options) {
    const opts = options || {};
    const headers = new Headers(opts.headers || {});
    const body = opts.body && typeof opts.body !== "string" ? JSON.stringify(opts.body) : opts.body;

    headers.set("Accept", "application/json");
    if (body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const currentToken = token();
    if (currentToken) {
      headers.set("Authorization", `Bearer ${currentToken}`);
    }

    const response = await fetch(apiUrl(path), {
      method: opts.method || "GET",
      headers,
      body
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};

    if (!response.ok) {
      const error = new Error(data.error || `Request failed with ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  window.CCF_API = {
    request,
    token,
    setToken,
    async login(email, password) {
      const data = await request("/api/auth/login", {
        method: "POST",
        body: { email, password }
      });
      setToken(data.token);
      return data.user;
    },
    async logout() {
      try {
        await request("/api/auth/logout", { method: "POST" });
      } finally {
        setToken("");
      }
    },
    async me() {
      const data = await request("/api/me");
      return data.user;
    }
  };
})();
