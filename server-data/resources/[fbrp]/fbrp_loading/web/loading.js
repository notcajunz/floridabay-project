const tips = [
  "Your server ID is always visible above your character.",
  "Look at a nearby player and press F5 to use the third-eye interaction system.",
  "F6 opens your two-slot tag wardrobe. Discord roles control what you can wear.",
  "F7 opens the ACE-filtered Florida Bay vehicle garage.",
  "Organizations use /duty followed by the organization name. Every shift is recorded.",
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
  musicVolume = document.querySelector("#music-volume");
let tipIndex = 0;

music.volume = 0.22;
const updateMusicButton = () => {
  const playing = !music.paused;
  musicToggle.classList.toggle("paused", !playing);
  musicToggle.setAttribute("aria-label", playing ? "Pause music" : "Play music");
  musicToggle.querySelector("span").textContent = playing ? "♫" : "▶";
};
musicToggle.addEventListener("click", () => {
  if (music.paused) music.play().catch(() => {});
  else music.pause();
  updateMusicButton();
});
musicVolume.addEventListener("input", () => {
  music.volume = Math.max(0, Math.min(1, Number(musicVolume.value) / 100));
  if (music.volume > 0 && music.paused) music.play().catch(() => {});
});
music.addEventListener("play", updateMusicButton);
music.addEventListener("pause", updateMusicButton);
music.play().catch(() => updateMusicButton());
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
