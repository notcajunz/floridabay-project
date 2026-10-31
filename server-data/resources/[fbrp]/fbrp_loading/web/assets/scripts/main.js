const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (s) => { if (!isFinite(s) || s < 0) return "0:00"; s = Math.floor(s); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const store = {
  get(k, d) { try { const v = localStorage.getItem("fbrp_" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("fbrp_" + k, JSON.stringify(v)); } catch (e) {} },
};
const prettyUrl = (u) => String(u).replace(/^https?:\/\//, "").replace(/\/$/, "");
const icon = (id) => `<svg><use href="#i-${id}"/></svg>`;
document.title = Config.ServerName || "Florida Bay Roleplay";

/* In FiveM links must be opened through the game, a normal <a> would navigate the loading screen. */
function openLink(url) {
  try { if (new URL(url).protocol !== "https:") return; } catch (e) { return; }
  try { if (window.invokeNative) { window.invokeNative("openUrl", url); return; } } catch (e) {}
  window.open(url, "_blank", "noopener");
}

/* ---------- cursor ---------- */
const cursor = $("#cursor");
document.addEventListener("mousemove", (e) => {
  cursor.style.left = e.clientX + "px";
  cursor.style.top = e.clientY + "px";
  cursor.classList.add("on");
});
document.addEventListener("mouseover", (e) => {
  cursor.classList.toggle("hover", !!(e.target.closest && e.target.closest("a, button, input, .track")));
});

/* ---------- tabs ---------- */
function showTab(name) {
  const btn = $(`.tab[data-tab="${name}"]`), t = $("#tab-" + name);
  if (!btn || !t) return;
  $$(".tab").forEach((b) => b.classList.remove("active"));
  $$(".tab-content").forEach((c) => c.classList.add("hidden"));
  btn.classList.add("active");
  t.classList.remove("hidden");
  t.classList.add("fade-in");
  setTimeout(() => t.classList.remove("fade-in"), 300);
}
$$(".tab").forEach((btn) => btn.addEventListener("click", () => showTab(btn.dataset.tab)));

/* ---------- hero: text + link buttons ---------- */
$("#eyebrow").textContent = Config.Eyebrow || "";
$("#pitch").textContent = Config.Pitch || "";
const linkDefs = [
  { key: "discord", label: "Discord", url: Config.Discord, icon: "assets/media/discord.png" },
  { key: "website", label: "Website", url: Config.Website, icon: "assets/media/website.png" },
  { key: "store", label: "Store", url: Config.Store, icon: "assets/media/icons/tebex.png" },
].filter((l) => l.url);
$("#links").innerHTML = linkDefs.map((l) =>
  `<a class="link ${l.key}" href="${esc(l.url)}" data-url="${esc(l.url)}"><span class="ico"><img src="${esc(l.icon)}" alt="" draggable="false"></span><span class="txt"><small>${l.label}</small><b>${esc(prettyUrl(l.url))}</b></span><svg class="out"><use href="#i-out"/></svg></a>`
).join("");
$("#links").addEventListener("click", (e) => {
  const a = e.target.closest("a.link");
  if (!a) return;
  e.preventDefault();
  openLink(a.dataset.url);
});

/* ---------- music player (YouTube links + mp4/mp3 files) ---------- */
const video = $("#mainvideo");
const tracks = (Config.Tracks || []).filter((t) => t && (t.file || t.youtube));
const volEl = $("#volumeSlider"), seekEl = $("#seek");
let idx = 0, vol = store.get("vol", Config.StartVolume), userMuted = store.get("muted", false);
let autoMuted = false, seeking = false, errorStreak = 0, trackFailed = false, userPaused = false;
let unmuteArmed = false, justUnmuted = false, loadToken = 0;
let yt = null, ytReady = false, ytState = -1, ytWant = null, ytErr = 0, ytFallback = null, ytApiFailed = false, ytBoot = null;

// accept a full YouTube link or just the 11 character id
const ytId = (v) => {
  const m = String(v).match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/);
  const id = m ? m[1] : String(v).trim();
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
};
tracks.forEach((t) => {
  if (!t.youtube) return;
  t.youtube = ytId(t.youtube);
  if (!t.poster) t.poster = `https://i.ytimg.com/vi/${t.youtube}/hqdefault.jpg`;
});

const isYT = () => !!(tracks[idx] && tracks[idx].youtube);
const curTime = () => { try { return isYT() ? (ytReady ? yt.getCurrentTime() : 0) : video.currentTime; } catch (e) { return 0; } };
const durTime = () => { try { return isYT() ? (ytReady ? yt.getDuration() : 0) : video.duration; } catch (e) { return 0; } };
const isPaused = () => (isYT() ? !(ytState === 1 || ytState === 3) : video.paused);

const setRange = (el) => el.style.setProperty("--p", ((el.value - el.min) / (el.max - el.min)) * 100 + "%");

function applyVolume() {
  const muted = userMuted || autoMuted;
  video.volume = Math.max(0, Math.min(1, vol / 100));
  video.muted = muted;
  if (ytReady) { try { yt.setVolume(vol); if (muted) yt.mute(); else yt.unMute(); } catch (e) {} }
  volEl.value = vol;
  setRange(volEl);
  $("#btnMute").innerHTML = icon(muted || vol == 0 ? "mute" : "vol");
}

function setState() {
  const paused = isPaused();
  $("#pEq").classList.toggle("paused", paused);
  let msg = paused ? "Paused" : "Now playing";
  if (trackFailed) msg = ytApiFailed ? (Config.YouTubeRelay ? "Relay page not reachable" : "YouTube blocked") : ytErr ? "YouTube error " + ytErr : "Song file not found";
  else if (autoMuted) msg = "Click anywhere for sound";
  $("#pState").textContent = msg;
  $("#btnPlay").innerHTML = icon(paused ? "play" : "pause");
  $$(".track .eq").forEach((e) => e.classList.toggle("paused", paused));
}

/* browsers can block autoplay with sound: start muted, unmute on the first click / key press */
function armUnmute() {
  if (unmuteArmed) return;
  unmuteArmed = true;
  const evs = ["keydown", "mousedown", "touchstart"];
  const go = () => {
    evs.forEach((ev) => document.removeEventListener(ev, go, true));
    unmuteArmed = false;
    autoMuted = false;
    justUnmuted = true; setTimeout(() => (justUnmuted = false), 400);
    applyVolume();
    tryPlay();
    setState();
  };
  evs.forEach((ev) => document.addEventListener(ev, go, true));
}
function fallbackMuted() {
  if (autoMuted || userPaused) return;
  autoMuted = true;
  applyVolume();
  if (isYT()) { try { yt.playVideo(); } catch (e) {} } else video.play().catch(() => {});
  setState();
  armUnmute();
}

function tryPlay() {
  if (isYT()) { if (ytReady) { try { yt.playVideo(); } catch (e) {} } return; }
  if (!video.getAttribute("src")) return;
  const p = video.play();
  if (p && p.catch) p.catch((err) => { if (!err || err.name !== "AbortError") fallbackMuted(); });
}

/* ---------- YouTube engine ---------- */
function loadYTApi() {
  const events = {
    onReady: () => { ytReady = true; clearTimeout(ytBoot); applyVolume(); if (ytWant) ytLoad(ytWant); },
    onAutoplayBlocked: fallbackMuted,
    onStateChange: (e) => {
      ytState = e.data;
      if (e.data === 1) {
        trackFailed = false; ytErr = 0; errorStreak = 0;
        clearTimeout(ytFallback);
        const d = durTime();
        if (d) {
          $("#tDur").textContent = fmt(d);
          const len = $(`.track[data-i="${idx}"] .len`);
          if (len && !len.textContent) len.textContent = fmt(d);
        }
      } else if (e.data === 0) {
        loadTrack(idx + 1);
      }
      setState();
    },
    onError: (e) => {
      // 100 = removed, 101/150 = owner blocked embedding, 153 = embed config error
      trackFailed = true; ytErr = e.data; clearTimeout(ytFallback); setState();
      const token = loadToken;
      if (tracks.length > 1 && ++errorStreak < tracks.length) setTimeout(() => { if (token === loadToken) loadTrack(idx + 1); }, 1800);
    },
  };

  /* Relay mode: the YouTube player runs inside a small page hosted on a normal https site
     (yt-relay.html). YouTube refuses to play inside FiveM's own nui:// page (error 153),
     but it works inside a real website. */
  if (Config.YouTubeRelay) {
    const f = document.createElement("iframe");
    f.id = "ytplayer"; f.src = Config.YouTubeRelay; f.allow = "autoplay; encrypted-media";
    $("#ytplayer").replaceWith(f);
    let relayOrigin = "";
    try { relayOrigin = new URL(Config.YouTubeRelay).origin; } catch (e) { ytApiFailed = true; return; }
    let time = 0, dur = 0;
    const send = (cmd, ...args) => { try { f.contentWindow.postMessage({ fbrp: 1, cmd, args }, relayOrigin); } catch (e) {} };
    f.addEventListener("load", () => send("hello"));
    window.addEventListener("message", (e) => {
      const d = e.data;
      if (e.source !== f.contentWindow || e.origin !== relayOrigin || !d || !d.fbrpRelay) return;
      if (d.type === "ready") events.onReady();
      else if (d.type === "state") events.onStateChange({ data: d.data });
      else if (d.type === "error") events.onError({ data: d.data });
      else if (d.type === "autoplayBlocked") events.onAutoplayBlocked();
      else if (d.type === "time") { time = d.t; dur = d.d; }
    });
    yt = {
      playVideo: () => send("play"), pauseVideo: () => send("pause"), stopVideo: () => send("stop"),
      seekTo: (s) => send("seek", s), setVolume: (v) => send("vol", v), mute: () => send("mute"), unMute: () => send("unmute"),
      loadVideoById: (id) => send("load", id), getCurrentTime: () => time, getDuration: () => dur,
    };
    ytBoot = setTimeout(() => { if (!ytReady) { ytApiFailed = true; if (isYT()) { trackFailed = true; setState(); } } }, 10000);
    return;
  }

  const init = () => {
    yt = new YT.Player("ytplayer", {
      width: "100%", height: "100%",
      playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0, iv_load_policy: 3, playsinline: 1 },
      events,
    });
  };
  if (window.YT && YT.Player) { init(); return; }
  window.onYouTubeIframeAPIReady = init;
  const s = document.createElement("script");
  s.src = "https://www.youtube.com/iframe_api";
  s.onerror = () => { ytApiFailed = true; if (isYT()) { trackFailed = true; setState(); } };
  document.head.appendChild(s);
}
function ytLoad(t) {
  if (!ytReady) { ytWant = t; return; }
  ytWant = null; ytState = -1;
  try { yt.loadVideoById(t.youtube); } catch (e) {}
  applyVolume();
}

function updateNow() {
  const t = tracks[idx];
  $("#pTitle").textContent = t.title || "Untitled";
  $("#pArtist").textContent = t.artist || "";
  $("#pThumb").src = t.poster || "";
  $("#pThumb").style.visibility = t.poster ? "visible" : "hidden";
  $("#tDur").textContent = t.length || "0:00";
  $("#tCur").textContent = "0:00";
  seekEl.value = 0;
  setRange(seekEl);
  $$(".track").forEach((el) => el.classList.toggle("active", +el.dataset.i === idx));
}

function loadTrack(i) {
  if (!tracks.length) return;
  idx = (i + tracks.length) % tracks.length;
  const t = tracks[idx], token = ++loadToken;
  trackFailed = false; userPaused = false; ytErr = 0;
  clearTimeout(ytFallback);
  updateNow();
  if (t.youtube) {
    document.body.classList.add("yt");
    video.pause(); video.removeAttribute("src"); video.load();
    if (ytApiFailed) { trackFailed = true; } else ytLoad(t);
    ytFallback = setTimeout(() => {
      if (token === loadToken && !trackFailed && !userPaused && ytState !== 1 && ytState !== 3) fallbackMuted();
    }, 3500);
  } else {
    document.body.classList.remove("yt");
    if (ytReady) { try { yt.stopVideo(); } catch (e) {} }
    ytState = -1;
    video.poster = t.poster || "";
    video.loop = tracks.length === 1;
    video.src = t.file;
    video.load();
    applyVolume();
    tryPlay();
  }
  applyVolume();
  setState();
}

function setupPlayer() {
  if (!tracks.length) { $("#player").style.display = "none"; $(".tab[data-tab=music]").remove(); $("#tab-music").remove(); return; }

  $("#trackList").innerHTML = tracks.map((t, i) => `
    <button class="track" data-i="${i}">
      <span class="tn"><img src="${esc(t.poster || "")}" alt="" draggable="false"><span class="badge"><span class="num">${i + 1}</span><span class="eq paused"><i></i><i></i><i></i><i></i></span></span></span>
      <span class="meta"><b>${esc(t.title || "Untitled")}</b><span>${esc(t.artist || "")}</span></span>
      <span class="len">${esc(t.length || "")}</span>
    </button>`).join("");
  $("#trackList").addEventListener("click", (e) => {
    const b = e.target.closest(".track");
    if (b && +b.dataset.i !== idx) loadTrack(+b.dataset.i);
  });

  $("#btnPrev").addEventListener("click", () => loadTrack(curTime() > 4 && !trackFailed ? idx : idx - 1));
  $("#btnNext").addEventListener("click", () => loadTrack(idx + 1));
  $("#btnPlay").addEventListener("click", () => {
    if (justUnmuted) return; // this same click just turned the sound on
    if (trackFailed) { loadTrack(idx); return; }
    if (isPaused()) { userPaused = false; autoMuted = false; applyVolume(); tryPlay(); }
    else { userPaused = true; if (isYT()) { try { yt.pauseVideo(); } catch (e) {} } else video.pause(); }
    setTimeout(setState, 150);
  });
  $("#btnList").addEventListener("click", () => showTab("music"));
  $("#btnMute").addEventListener("click", () => {
    if (justUnmuted) return;
    if (autoMuted) autoMuted = false; else userMuted = !userMuted;
    if (!userMuted && vol == 0) vol = 15;
    store.set("muted", userMuted); store.set("vol", vol);
    applyVolume(); setState();
  });
  volEl.addEventListener("input", () => {
    vol = +volEl.value; userMuted = false; autoMuted = false;
    store.set("vol", vol); store.set("muted", false);
    applyVolume();
  });

  seekEl.addEventListener("input", () => {
    seeking = true;
    setRange(seekEl);
    const d = durTime();
    if (d) $("#tCur").textContent = fmt((seekEl.value / 1000) * d);
  });
  seekEl.addEventListener("change", () => {
    const d = durTime();
    if (d) {
      const s = (seekEl.value / 1000) * d;
      if (isYT()) { try { yt.seekTo(s, true); } catch (e) {} } else video.currentTime = s;
    }
    seeking = false;
  });

  // progress bar + time (works for both engines)
  setInterval(() => {
    if (seeking) return;
    const d = durTime(), c = curTime();
    if (!d || !isFinite(d)) return;
    seekEl.value = (c / d) * 1000;
    setRange(seekEl);
    $("#tCur").textContent = fmt(c);
    if (isYT()) setState();
  }, 500);

  // mp4 / mp3 file events
  video.addEventListener("loadedmetadata", () => {
    $("#tDur").textContent = fmt(video.duration);
    const len = $(`.track[data-i="${idx}"] .len`);
    if (len && !len.textContent) len.textContent = fmt(video.duration);
  });
  video.addEventListener("loadeddata", () => { trackFailed = false; setState(); });
  video.addEventListener("playing", () => { trackFailed = false; errorStreak = 0; setState(); });
  video.addEventListener("play", setState);
  video.addEventListener("pause", setState);
  video.addEventListener("ended", () => loadTrack(idx + 1));
  video.addEventListener("stalled", () => { if (!video.paused && !isYT()) video.play().catch(() => {}); });
  video.addEventListener("error", () => {
    if (isYT() || !video.getAttribute("src")) return;
    trackFailed = true;
    console.warn("[FBRP] could not load", tracks[idx] && tracks[idx].file);
    setState();
  });

  const start = Config.StartTrack === "random" ? Math.floor(Math.random() * tracks.length) : (+Config.StartTrack || 0);
  applyVolume();
  if (tracks.some((t) => t.youtube)) loadYTApi();
  loadTrack(start);
  setState();
}

document.addEventListener("keydown", (e) => {
  if ((e.which || e.keyCode) === Config.HideoverlayKeybind) document.body.classList.toggle("hide-ui");
});

/* ---------- content ---------- */
function setup() {
  let sale = null;
  if (Config.Sales.active) sale = Config.Sales;
  else if (Config.Sales.upcoming && Config.Sales.upcoming.enabled) {
    const u = Config.Sales.upcoming, start = new Date(u.startDate).getTime(), now = Date.now();
    if (now >= start && now <= start + u.durationDays * 864e5) sale = u;
  }
  let html = "";
  if (sale) {
    const inner = `<svg class="ic"><use href="#i-pumpkin"/></svg><span>${esc(sale.text)}</span>`;
    html += sale.link ? `<button class="sales-banner" data-url="${esc(sale.link)}">${inner}</button>` : `<div class="sales-banner">${inner}</div>`;
  }
  html += `<div><h2 class="welcome-title">${esc(Config.Welcome.title)}</h2><p class="welcome-text">${Config.Welcome.text}</p></div>`;
  if ((Config.Welcome.steps || []).length) {
    html += `<div class="steps">${Config.Welcome.steps.map((st, i) => `<div class="step"><span class="n">${i + 1}</span><h4>${esc(st.title)}</h4><p>${esc(st.text)}</p></div>`).join("")}</div>`;
  }
  $(".welcome-container").innerHTML = html;
  const banner = $(".sales-banner[data-url]");
  if (banner) banner.addEventListener("click", () => openLink(banner.dataset.url));

  $(".news-container").innerHTML = (Config.Updates || []).map((n) =>
    `<div class="news-item">${n.image ? `<img src="${esc(n.image)}" alt="" draggable="false">` : ""}<h3>${esc(n.title)}</h3><p>${esc(n.text)}</p></div>`
  ).join("");

  if (!(Config.Team || []).length) { $(".tab[data-tab=team]").remove(); $("#tab-team").remove(); }
  (Config.Team || []).forEach((member) => {
    const list = Array.isArray(member.description) ? member.description : [member.description];
    const badges = list.filter(Boolean).map((d) => `<span class="description-badge">${esc(d)}</span>`).join("");
    const avatar = member.image
      ? `<img class="avatar" src="${esc(member.image)}" alt="${esc(member.name)}" draggable="false">`
      : `<div class="avatar letter">${esc((member.name || "?").trim().charAt(0).toUpperCase())}</div>`;
    $(".team-container").insertAdjacentHTML("beforeend", `
      <div class="team-card" style="--color: ${esc(member.color || "#ff7a1a")}">
        ${avatar}
        <div class="info">
          <p class="name">${esc(member.name)}</p>
          <div class="description">${badges}</div>
          ${member.quote ? `<p class="quote">"${esc(member.quote)}"</p>` : ""}
        </div>
      </div>`);
  });
}

/* ---------- loading progress (sent by FiveM) ---------- */
window.addEventListener("message", (e) => {
  if (e.data && e.data.eventName === "loadProgress") {
    const p = Math.round(e.data.loadFraction * 100);
    $("#progressFill").style.width = p + "%";
    $("#progressText").textContent = p + "%";
  }
});

/* ---------- halloween effects ---------- */
const fx = Object.assign({ embers: true, bats: true, fog: true }, Config.Effects || {});
if (!fx.fog) document.body.classList.add("no-fog");

function startEmbers() {
  const c = $("#embers");
  if (!fx.embers) { c.remove(); return; }
  const ctx = c.getContext("2d");
  let W = 0, H = 0;
  const resize = () => { W = c.width = window.innerWidth; H = c.height = window.innerHeight; };
  resize();
  window.addEventListener("resize", resize);

  const sprite = (rgb) => {
    const s = document.createElement("canvas"); s.width = s.height = 32;
    const g = s.getContext("2d"), r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(.18, `rgba(${rgb},.95)`);
    r.addColorStop(.5, `rgba(${rgb},.25)`);
    r.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = r; g.fillRect(0, 0, 32, 32);
    return s;
  };
  const sprites = [sprite("255,130,30"), sprite("255,176,40"), sprite("160,90,255")];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const make = (initial) => ({
    x: rnd(0, W), y: initial ? rnd(0, H) : H + rnd(10, 80),
    vy: rnd(14, 46), sway: rnd(10, 38), f: rnd(.25, .8), ph: rnd(0, 6.28),
    s: rnd(8, 24), tw: rnd(.8, 2.2), spr: sprites[Math.random() < .12 ? 2 : Math.random() < .35 ? 1 : 0],
  });
  const N = 40;
  const ps = Array.from({ length: N }, () => make(true));
  let last = performance.now(), acc = 0;
  (function frame(now) {
    requestAnimationFrame(frame);
    const dt = (now - last) / 1000; last = now; acc += dt;
    if (acc < 1 / 30) return; // ~30fps is plenty and keeps the load light
    const step = Math.min(acc, .1); acc = 0;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    const k = H / 1080;
    for (const p of ps) {
      p.y -= p.vy * k * step;
      p.ph += p.f * step;
      const x = p.x + Math.sin(p.ph * 2.2) * p.sway * k;
      if (p.y < -30) Object.assign(p, make(false), { y: H + 20 });
      const fade = Math.min(1, (H - p.y) / (H * .18)) * Math.min(1, p.y / (H * .25) + .15);
      const a = Math.max(0, (.4 + .35 * Math.sin(now / 1000 * p.tw + p.ph)) * fade);
      ctx.globalAlpha = a;
      const s = p.s * k * 1.6;
      ctx.drawImage(p.spr, x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  })(last);
}

const BAT_SVG = `<svg viewBox="0 0 100 50" aria-hidden="true">
  <g class="wing l"><path d="M47 24C40 16 24 10 6 12C9 16 10 20 9 25C13 22 17 23 19 28C23 25 28 27 30 32C34 29 40 31 44 36C45 32 46 28 47 24Z"/></g>
  <g class="wing r"><g transform="translate(100 0) scale(-1 1)"><path d="M47 24C40 16 24 10 6 12C9 16 10 20 9 25C13 22 17 23 19 28C23 25 28 27 30 32C34 29 40 31 44 36C45 32 46 28 47 24Z"/></g></g>
  <path d="M50 18C52.6 18 53.6 21 53.6 24C53.6 30 52 38 50 42C48 38 46.4 30 46.4 24C46.4 21 47.4 18 50 18Z"/>
  <path d="M47.3 20.4L46.4 13.6L49.6 18.2ZM52.7 20.4L53.6 13.6L50.4 18.2Z"/>
</svg>`;

function startBats() {
  const host = $("#bats");
  if (!fx.bats || !host.animate) { host.remove(); return; }
  const flock = () => {
    const n = 2 + Math.floor(Math.random() * 3);
    const W = window.innerWidth, H = window.innerHeight;
    const dir = Math.random() < .5 ? 1 : -1;
    const baseY = H * (.07 + Math.random() * .3);
    for (let i = 0; i < n; i++) {
      const el = document.createElement("div");
      el.className = "bat";
      el.innerHTML = BAT_SVG;
      const scale = .6 + Math.random() * .7;
      el.style.width = 4 * scale + "rem";
      host.appendChild(el);
      const y0 = baseY + Math.random() * H * .08, amp = 14 + Math.random() * 26, waves = 2 + Math.random() * 2, ph = Math.random() * 6.28;
      const x0 = dir > 0 ? -120 : W + 120, x1 = dir > 0 ? W + 120 : -120;
      const frames = Array.from({ length: 24 }, (_, j) => {
        const t = j / 23;
        return { transform: `translate(${x0 + (x1 - x0) * t}px, ${y0 + Math.sin(t * waves * 6.28 + ph) * amp - t * H * .05}px)` };
      });
      const a = el.animate(frames, { duration: 9000 + Math.random() * 4000, delay: i * 500 + Math.random() * 400, easing: "linear", fill: "both" });
      a.onfinish = () => el.remove();
    }
    setTimeout(flock, 16000 + Math.random() * 16000);
  };
  setTimeout(flock, 3500);
}

setup();
setupPlayer();
startEmbers();
startBats();

/* ---------- live Florida Bay state ---------- */
function refreshLiveStatus() {
  const host = $("#liveStatus");
  if (!Config.StatusUrl || !host) return;
  fetch(Config.StatusUrl, { cache: "no-store", credentials: "omit" })
    .then((response) => response.ok ? response.json() : null)
    .then((status) => {
      if (!status) throw new Error("empty status");
      const online = status.online !== false;
      host.classList.toggle("online", online);
      host.classList.toggle("offline", !online);
      $("#livePlayers").textContent = online
        ? `${Number(status.players) || 0}/${Number(status.maxPlayers) || 0} players online`
        : "Server starting";
      $("#liveAop").textContent = status.aop
        ? `AOP: ${status.aop}${status.peacetime ? " · Peacetime" : ""}`
        : "Live operations";
    })
    .catch(() => {
      host.classList.remove("online");
      host.classList.add("offline");
      $("#livePlayers").textContent = "Status unavailable";
      $("#liveAop").textContent = "The loading screen will keep trying";
    });
}
refreshLiveStatus();
setInterval(refreshLiveStatus, 30000);
