(function () {
  const savedTheme = localStorage.getItem("theme");

  function applyTheme(theme) {
    const isLight = theme === "light";
    document.documentElement.classList.toggle("light", isLight);
    document.body.classList.toggle("light", isLight);
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.textContent = isLight ? "Dark" : "Light";
      button.setAttribute("aria-label", isLight ? "Switch to dark theme" : "Switch to light theme");
    });
  }

  window.toggleTheme = function () {
    const nextTheme = document.body.classList.contains("light") ? "dark" : "light";
    localStorage.setItem("theme", nextTheme);
    applyTheme(nextTheme);
  };

  document.addEventListener("DOMContentLoaded", function () {
    applyTheme(savedTheme === "light" ? "light" : "dark");

    const currentPage = document.body.getAttribute("data-page");
    document.querySelectorAll("[data-nav]").forEach((link) => {
      link.classList.toggle("active", link.getAttribute("data-nav") === currentPage);
    });
  });
})();
