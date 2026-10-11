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
    countTo($("#stat-explorers"), status.passportLandmarks || 10);
    $("#brief-aop").textContent = status.aop || "Statewide";
    $("#brief-peacetime").textContent = status.peacetime ? "In effect" : "Off";
    const priorities = Object.values(status.priority || {});
    const active = priorities.find((item) => item?.status === "active");
    const cooldown = priorities.find((item) => item?.status === "cooldown");
    $("#brief-priority").textContent = active ? `In progress · ${active.label || active.zone || "city"}` : cooldown ? `Cooldown · ${cooldown.remaining || 0}m` : "Available";
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
    $("#brief-priority").textContent = "Status unavailable";
    $("#brief-peacetime").textContent = "—";
  });

const regions = {
  city: { number: "01", kicker: "CITY STORIES", title: "Los Santos", copy: "Dense calls, late-night traffic stops, businesses, nightlife, and stories that collide block by block.", tags: ["Fast-paced", "Police", "Nightlife"], scene: "Open a late-night food stand and see who becomes a regular." },
  desert: { number: "02", kicker: "OPEN-ROAD STORIES", title: "Grand Senora", copy: "Long roads, roadside trouble, dusty hideouts, and room for a strange idea to breathe.", tags: ["Road trips", "Outlaws", "Mechanics"], scene: "Break down on Route 68 with a suspicious package in the trunk." },
  alamo: { number: "03", kicker: "WATERFRONT STORIES", title: "Alamo Sea", copy: "Quiet marinas and scrubland surround fresh-water fishing, boat calls, and patient small-town scenes.", tags: ["Fishing", "EMS", "Slow burn"], scene: "Launch before sunrise and chase the freshwater server record." },
  paleto: { number: "04", kicker: "SMALL-TOWN STORIES", title: "Paleto Bay", copy: "A close-knit northern town where everybody recognizes the cruiser—and remembers your last scene.", tags: ["Community", "Fire & Rescue", "Local life"], scene: "Start a volunteer search party when a hiker misses check-in." },
  tongva: { number: "05", kicker: "HIDDEN STORIES", title: "Tongva Hills", copy: "Vineyards, switchbacks, waterfalls, and secluded overlooks made for intimate character work.", tags: ["Exploration", "Photography", "Civilian"], scene: "Plan a photo shoot that accidentally captures evidence of a crime." },
  east: { number: "06", kicker: "COASTAL STORIES", title: "East Coast", copy: "Cliff roads and a lonely lighthouse make the eastern shore perfect for patrols, rescues, and secrets.", tags: ["Coast guard", "Chases", "Passport"], scene: "Follow a distress flare to the lighthouse after the storm rolls in." },
};

$$('[data-region]').forEach((button) => button.addEventListener('click', () => {
  const region = regions[button.dataset.region];
  if (!region) return;
  $$('[data-region]').forEach((node) => node.classList.toggle('active', node === button));
  const card = $('#region-card');
  card.classList.remove('region-swap');
  void card.offsetWidth;
  card.classList.add('region-swap');
  $('#region-number').textContent = region.number;
  $('#region-kicker').textContent = region.kicker;
  $('#region-title').textContent = region.title;
  $('#region-copy').textContent = region.copy;
  $('#region-tags').innerHTML = region.tags.map((tag) => `<span>${tag}</span>`).join('');
  $('#region-scene').textContent = region.scene;
}));

const guide = {
  action: ["Report a stolen sports car, then play both the frantic owner and the officers hunting it.", "Best fit: Los Santos or Grand Senora · try /911 when the scene is ready."],
  social: ["Host a sunset meet at Del Perro Pier and give every arrival one question that reveals their character.", "Best fit: Los Santos · make the pier your first Passport stamp."],
  slow: ["Take a battered truck north, fish the Alamo Sea, and stop anywhere the road gives you an excuse.", "Best fit: Alamo Sea to Paleto Bay · press F4 for your Passport."],
};
$$('[data-guide]').forEach((button) => button.addEventListener('click', () => {
  const result = guide[button.dataset.guide];
  if (!result) return;
  $$('[data-guide]').forEach((node) => node.classList.toggle('active', node === button));
  const box = $('#guide-result');
  box.classList.remove('pop');
  void box.offsetWidth;
  box.classList.add('pop');
  box.innerHTML = `<small>YOUR FIELD NOTE</small><b>${result[0]}</b><p>${result[1]}</p>`;
}));

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
