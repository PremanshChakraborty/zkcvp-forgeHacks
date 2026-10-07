// Preview-only theme and density switcher. Not part of the design system.
//
// Ledger is light-first: `:root` in tokens.css holds the light values and the
// dark ones are applied by `prefers-color-scheme`. "System" therefore REMOVES
// the attribute rather than writing a guessed value, so the OS resumes control.
(function () {
  var root = document.documentElement;

  function applyTheme(mode) {
    if (mode === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", mode);

    document.querySelectorAll("[data-mode]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
    });
    try {
      localStorage.setItem("lg-preview-theme", mode);
    } catch (e) {}
  }

  function applyDensity(mode) {
    document.body.setAttribute("data-density", mode);

    document.querySelectorAll("[data-density-mode]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.densityMode === mode));
    });
    try {
      localStorage.setItem("lg-preview-density", mode);
    } catch (e) {}
  }

  document.addEventListener("click", function (e) {
    var theme = e.target.closest("[data-mode]");
    if (theme) applyTheme(theme.dataset.mode);

    var density = e.target.closest("[data-density-mode]");
    if (density) applyDensity(density.dataset.densityMode);
  });

  var savedTheme = "system";
  var savedDensity = "comfortable";
  try {
    savedTheme = localStorage.getItem("lg-preview-theme") || "system";
    savedDensity = localStorage.getItem("lg-preview-density") || "comfortable";
  } catch (e) {}

  applyTheme(savedTheme);
  applyDensity(savedDensity);
})();
