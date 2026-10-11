const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

let connectCommand = "connect join.floridabay.net";

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 2600);
}

/** Counts a number up from zero once it scrolls into view. */
function countTo(node, value) {
  const target = Number(value) || 0;
  node.dataset.target = String(target);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || target === 0) {
    node.textContent = target.toLocaleString();
    return;
  }
  const start = performance.now();
  const step = (time) => {
    const t = Math.min(1, (time - start) / 1100);
    node.textContent = Math.round(target * (1 - Math.pow(1 - t, 3))).toLocaleString();
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

fetch("api/public/status", { cache: "no-store" })
  .then((response) => response.ok ? response.json() : Promise.reject())
  .then((status) => {
    const online = Boolean(status.online);
    $("#server-state").textContent = online ? "City online" : "City restarting";
    $("#server-detail").textContent = online ? `${status.players} in the city · AOP ${status.aop || "Statewide"}` : "Back shortly";
    $("#dock-state").textContent = online ? "Online" : "Restarting";
    $("#status-chip").classList.toggle("offline", !online);
    $("#aop").textContent = status.aop || "Statewide";
    countTo($("#players"), status.players);
    countTo($("#stat-players"), status.players);
    countTo($("#stat-staff"), status.staff);
    countTo($("#stat-tickets"), status.ticketsResolved);
    if (status.connectUrl) {
      $$("[data-connect]").forEach((link) => (link.href = status.connectUrl));
      const address = String(status.connectUrl).replace(/^fivem:\/\/connect\//, "");
      connectCommand = `connect ${address}`;
      $$("#connect-text, #connect-text-2, [data-connect-text]").forEach((node) => (node.textContent = connectCommand));
    }
  })
  .catch(() => {
    $("#server-state").textContent = "Status unavailable";
    $("#server-detail").textContent = "Try the portal or connect in FiveM";
    $("#dock-state").textContent = "Unknown";
  });

async function copyConnect() {
  try {
    await navigator.clipboard.writeText(connectCommand);
    toast("Copied - press F8 in FiveM and paste.");
  } catch {
    toast(connectCommand);
  }
}
$("#copy-connect").addEventListener("click", copyConnect);
$$("[data-copy-connect]").forEach((button) => button.addEventListener("click", copyConnect));

// Navigation: solid background once scrolled, and a drawer on small screens.
const nav = $("#topnav");
const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 24);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();
const toggle = $("#menu-toggle");
toggle.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  toggle.setAttribute("aria-expanded", String(open));
});
$$("#topnav-links a").forEach((link) => link.addEventListener("click", () => {
  nav.classList.remove("open");
  toggle.setAttribute("aria-expanded", "false");
}));

$("#year").textContent = new Date().getFullYear();

// Content stays visible if this script never runs; only animate once it has loaded.
document.documentElement.classList.add("js-reveal");
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) if (entry.isIntersecting) {
    entry.target.classList.add("visible");
    observer.unobserve(entry.target);
  }
}, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
$$(".reveal").forEach((element, index) => {
  element.style.setProperty("--delay", `${Math.min(index % 6, 5) * 70}ms`);
  observer.observe(element);
});
