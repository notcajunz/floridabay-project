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

/* In FiveM links must be opened through the game, a normal <a> would navigate the loading screen. */
function openLink(url) {
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
  { key: "discord", label: "Discord", url: Config.Discord },
  { key: "website", label: "Website", url: Config.Website },
].filter((l) => l.url);
$("#links").innerHTML = linkDefs.map((l) =>
  `<a class="link ${l.key}" href="${esc(l.url)}" data-url="${esc(l.url)}"><span class="ico"><img src="assets/media/${l.key}.png" alt="" draggable="false"></span><span class="txt"><small>${l.label}</small><b>${esc(prettyUrl(l.url))}</b></span><svg class="out"><use href="#i-out"/></svg></a>`
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
const ytId = (v) => { const m = String(v).match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/); return m ? m[1] : String(v).trim(); };
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
    let time = 0, dur = 0;
    const send = (cmd, ...args) => { try { f.contentWindow.postMessage({ fbrp: 1, cmd, args }, "*"); } catch (e) {} };
    window.addEventListener("message", (e) => {
      const d = e.data;
      if (!d || !d.fbrpRelay) return;
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
  $("#pThumb").onerror = () => { $("#pThumb").style.visibility = "hidden"; };
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
      <span class="tn"><img src="${esc(t.poster || "")}" alt="" draggable="false" onerror="this.style.visibility='hidden'"><span class="badge"><span class="num">${i + 1}</span><span class="eq paused"><i></i><i></i><i></i><i></i></span></span></span>
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
    const inner = `<svg class="ic"><use href="#i-sun"/></svg><span>${esc(sale.text)}</span>`;
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
  // one member per row, in the order they are listed in Config.Team
  const initial = (n) => (String(n || "?").replace(/^[^A-Za-z]*/, "").charAt(0) || "?").toUpperCase();
  (Config.Team || []).forEach((member, i) => {
    const list = Array.isArray(member.description) ? member.description : [member.description];
    const badges = list.filter(Boolean).map((d) => `<span class="description-badge">${esc(d)}</span>`).join("");
    const avatar = member.image
      ? `<img class="avatar" src="${esc(member.image)}" alt="" draggable="false">`
      : `<div class="avatar letter">${esc(initial(member.name))}</div>`;
    $(".team-container").insertAdjacentHTML("beforeend", `
      <div class="team-card" style="--color: ${esc(member.color || "#37e2d0")}" data-letter="${esc(initial(member.name))}">
        <span class="rank">${i + 1}</span>
        ${avatar}
        <div class="info">
          <div class="top"><p class="name">${esc(member.name)}</p><div class="description">${badges}</div></div>
          ${member.quote ? `<p class="quote">"${esc(member.quote)}"</p>` : ""}
        </div>
      </div>`);
  });
  // if a profile picture fails to load (offline / link expired) show the coloured letter instead
  $$(".team-card img.avatar").forEach((img) => img.addEventListener("error", () => {
    const d = document.createElement("div");
    d.className = "avatar letter"; d.textContent = img.closest(".team-card").dataset.letter;
    img.replaceWith(d);
  }));
}

/* ---------- loading progress (sent by FiveM) ---------- */
window.addEventListener("message", (e) => {
  if (e.data && e.data.eventName === "loadProgress") {
    const p = Math.round(e.data.loadFraction * 100);
    $("#progressFill").style.width = p + "%";
    $("#progressText").textContent = p + "%";
    if (window.FBScene) FBScene.setProgress(e.data.loadFraction);
  }
});

/* ---------- beach scene + logo ---------- */
const fx = Object.assign({ waves: true, clouds: true, birds: true, plane: true, palms: true, sunset: true, blur: true }, Config.Effects || {});
document.body.classList.add(Config.Background === "video" ? "bg-video" : "bg-scene");
["palms", "clouds", "blur"].forEach((k) => { if (fx[k]) document.body.classList.add("fx-" + k); });

/* The logo is a video. logo.webm has a transparent background; if a browser cannot play it we use
   logo.mp4 (black background) and the "screen" class makes the black disappear. */
function setupLogo() {
  const el = $("#logo");
  const useMp4 = () => { el.classList.add("screen"); el.src = "assets/media/logo.mp4"; el.play().catch(() => {}); };
  if (el.canPlayType('video/webm; codecs="vp9"')) { el.src = "assets/media/logo.webm"; el.addEventListener("error", useMp4, { once: true }); }
  else useMp4();
  el.play().catch(() => {});
}

setup();
setupPlayer();
setupLogo();
