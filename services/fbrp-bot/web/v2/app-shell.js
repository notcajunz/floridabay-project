/* Saltline shell enhancements. Business behavior stays in each page module. */
const root = document.documentElement;
root.dataset.interface = "saltline";

const ready = () => requestAnimationFrame(() => root.classList.add("is-ready"));
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready, { once: true });
else ready();

const clearLegacyDepth = (scope = document) => {
  scope.querySelectorAll?.(".tilt-ready, .tilting, .tilt-reset").forEach((node) => {
    node.classList.remove("tilt-ready", "tilting", "tilt-reset");
    node.style.removeProperty("--rx");
    node.style.removeProperty("--ry");
    node.style.removeProperty("--lift");
    node.style.removeProperty("transform");
  });
  scope.querySelectorAll?.(".ocean-3d").forEach((node) => node.remove());
};

clearLegacyDepth();
new MutationObserver((records) => {
  records.forEach((record) => record.addedNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) clearLegacyDepth(node);
  }));
}).observe(document.documentElement, { childList: true, subtree: true });

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  document.querySelectorAll(".sidebar.open, .shell.menu-open, body.drawer-open").forEach((node) => node.classList.remove("open", "menu-open", "drawer-open"));
});

document.addEventListener("click", (event) => {
  const copy = event.target.closest("[data-copy]");
  if (!copy || !navigator.clipboard) return;
  navigator.clipboard.writeText(copy.dataset.copy).catch(() => {});
});
