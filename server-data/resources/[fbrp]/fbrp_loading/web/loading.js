const tips = [
  "Your server ID is always visible above your character.",
  "Look at a nearby player and press F5 to use the third-eye interaction system.",
  "F6 opens your two-slot tag wardrobe. Discord roles control what you can wear.",
  "F7 opens the ACE-filtered Florida Bay vehicle garage.",
  "Run /duty and pick your organization from the menu to clock in. Every shift is recorded.",
  "Staff powers remain locked until staff use /clockin.",
  "Use /911 for emergencies and /panic for an officer panic activation.",
];
const status = document.querySelector("#status-text"),
  percent = document.querySelector("#percent"),
  progress = document.querySelector("#progress"),
  track = document.querySelector(".track"),
  tip = document.querySelector("#tip"),
  clock = document.querySelector("#clock"),
  music = document.querySelector("#loading-music"),
  musicToggle = document.querySelector("#music-toggle"),
  musicVolume = document.querySelector("#music-volume"),
  musicSource = document.querySelector("#music-source"),
  musicUrl = document.querySelector("#music-url"),
  musicError = document.querySelector("#music-error");
let tipIndex = 0;
let youtubePlayer = null;
let youtubeReady = false;
let youtubeVideoId = null;
let activeMusic = "local";

const loadingMusicConfig = window.FBRP_LOADING_MUSIC || {};
const configuredVolume = Math.max(0, Math.min(100, Number(loadingMusicConfig.volume) || 22));
musicVolume.value = String(configuredVolume);

function youtubeId(value) {
  const raw = String(value || "").trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let id = null;
    if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0];
    if (["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"].includes(host)) {
      id = url.searchParams.get("v") || url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/)?.[1];
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id || "") ? id : null;
  } catch (_) {
    return null;
  }
}

function activePlaying() {
  if (activeMusic === "youtube") {
    return youtubeReady && youtubePlayer?.getPlayerState() === window.YT?.PlayerState?.PLAYING;
  }
  return !music.paused;
}

music.volume = configuredVolume / 100;
const updateMusicButton = () => {
  const playing = activePlaying();
  musicToggle.classList.toggle("paused", !playing);
  musicToggle.setAttribute("aria-label", playing ? "Pause music" : "Play music");
  musicToggle.querySelector("span").textContent = playing ? "♫" : "▶";
};
musicToggle.addEventListener("click", () => {
  if (activeMusic === "youtube" && youtubeReady) {
    if (activePlaying()) youtubePlayer.pauseVideo();
    else youtubePlayer.playVideo();
  } else if (music.paused) music.play().catch(() => {});
  else music.pause();
  updateMusicButton();
});
musicVolume.addEventListener("input", () => {
  const volume = Math.max(0, Math.min(100, Number(musicVolume.value) || 0));
  music.volume = volume / 100;
  if (youtubeReady) youtubePlayer.setVolume(volume);
  if (volume > 0 && activeMusic === "local" && music.paused) music.play().catch(() => {});
});
music.addEventListener("play", updateMusicButton);
music.addEventListener("pause", updateMusicButton);

function showMusicError(message = "") {
  musicError.textContent = message;
  musicError.classList.toggle("show", Boolean(message));
}

function playYouTube(value) {
  const id = youtubeId(value);
  if (!id) {
    showMusicError("Use a valid YouTube link");
    return false;
  }
  showMusicError();
  youtubeVideoId = id;
  activeMusic = "youtube";
  music.pause();
  musicToggle.querySelector("b").textContent = loadingMusicConfig.title || "YouTube audio";
  if (youtubeReady) {
    youtubePlayer.loadVideoById({ videoId: id, startSeconds: 0 });
    youtubePlayer.setVolume(Number(musicVolume.value));
  }
  updateMusicButton();
  return true;
}

musicSource.addEventListener("submit", (event) => {
  event.preventDefault();
  playYouTube(musicUrl.value);
});

window.onYouTubeIframeAPIReady = () => {
  youtubePlayer = new YT.Player("youtube-player", {
    width: "200",
    height: "200",
    playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1, rel: 0, origin: window.location.origin },
    events: {
      onReady: () => {
        youtubeReady = true;
        youtubePlayer.setVolume(Number(musicVolume.value));
        if (youtubeVideoId) youtubePlayer.loadVideoById({ videoId: youtubeVideoId, startSeconds: 0 });
        else music.play().catch(() => updateMusicButton());
      },
      onStateChange: ({ data }) => {
        if (data === YT.PlayerState.ENDED && activeMusic === "youtube") {
          youtubePlayer.seekTo(0, true);
          youtubePlayer.playVideo();
        }
        updateMusicButton();
      },
      onAutoplayBlocked: () => {
        showMusicError("Press play to start YouTube audio");
        updateMusicButton();
      },
      onError: () => {
        showMusicError("That video cannot be played here");
        activeMusic = "local";
        musicToggle.querySelector("b").textContent = "Night Drive";
        music.play().catch(() => updateMusicButton());
      },
    },
  });
};

if (loadingMusicConfig.youtubeUrl) {
  musicUrl.value = loadingMusicConfig.youtubeUrl;
  playYouTube(loadingMusicConfig.youtubeUrl);
  setTimeout(() => {
    if (activeMusic !== "youtube" || youtubeReady) return;
    youtubeVideoId = null;
    activeMusic = "local";
    musicToggle.querySelector("b").textContent = "Night Drive";
    showMusicError("YouTube unavailable — using Night Drive");
    music.play().catch(() => updateMusicButton());
  }, 8000);
} else {
  music.play().catch(() => updateMusicButton());
}
window.addEventListener("message", ({ data }) => {
  if (data?.eventName !== "loadProgress") return;
  const value = Math.max(0, Math.min(1, Number(data.loadFraction) || 0)),
    amount = Math.round(value * 100);
  progress.style.width = `${amount}%`;
  track.style.setProperty("--progress", `${amount}%`);
  percent.textContent = `${amount}%`;
  status.textContent =
    amount >= 100
      ? "Welcome to Florida Bay"
      : amount > 70
        ? "Synchronizing your roleplay profile"
        : amount > 35
          ? "Loading coastal services"
          : "Establishing a secure session";

  if (amount >= 100) {
    document.documentElement.classList.add("complete");
  }
});
setInterval(() => {
  tipIndex = (tipIndex + 1) % tips.length;
  tip.animate(
    [
      { opacity: 0, transform: "translateY(4px)" },
      { opacity: 1, transform: "none" },
    ],
    { duration: 420 },
  );
  tip.textContent = tips[tipIndex];
}, 5200);
setInterval(() => {
  clock.textContent = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}, 1000);
