Config = {}; // Don't touch

/* ------------------------------------------------------------------
   FLORIDA BAY ROLEPLAY (FBRP) - LOADING SCREEN CONFIG
   Everything you normally need to edit lives in this file.
------------------------------------------------------------------- */

Config.ServerName = "Florida Bay Roleplay";
Config.Discord = "https://discord.gg/floridabay"; // Discord button (bottom of the logo)
Config.Website = "https://floridabay.net/";       // Website button
Config.Store = "https://store.floridabay.net/";  // Store button
Config.StatusUrl = "https://floridabay.net/api/public/status";

Config.HideoverlayKeybind = 112; // F1 hides / shows the menu

// Text under the logo
Config.Eyebrow = "Welcome to the Bay";
Config.Pitch = "Your Florida story starts here. Check the live server state, review the latest community information and choose the soundtrack while the city loads.";

// Welcome tab
Config.Welcome = {
  title: "Welcome to Florida Bay Roleplay",
  text: "Florida Bay is a standalone roleplay community built around collaborative scenes, fair play and stories that leave room for everyone involved.<br><br>Join the Discord to verify, read the rules and connect your account before playing.",
  steps: [
    { title: "Join the Discord", text: "Support, updates and community events all live in our Discord server." },
    { title: "Read the rules", text: "Know the rules before you load in so your first night goes smoothly." },
    { title: "Build your story", text: "Create a grounded character and give every scene room to develop." },
  ],
};

// Banner on the Welcome tab (turn on whenever you run a sale / event)
Config.Sales = {
  active: false, // true = show banner now
  text: "HALLOWEEN SALE: check the Discord for details!",
  link: Config.Discord,

  // Scheduled banner (shown automatically between startDate and startDate + durationDays)
  upcoming: {
    enabled: false,
    startDate: "2026-10-31T04:00:00Z", // UTC
    durationDays: 3,
    text: "HALLOWEEN SALE: check the Discord for details!",
    link: Config.Discord,
  },
};

// Updates tab. Add "image" (URL or assets path) to a post if you want a picture.
Config.Updates = [
  { title: "Live operations", text: "AOP, peacetime and regional priority state are managed live by the Florida Bay operations team." },
  { title: "Connect your Discord", text: "Verification, applications, support and purchased entitlements all use your linked Discord account." },
  { title: "Know the rules", text: "Read the current rules before joining a scene; respect value-of-life and escalation requirements." },
  { title: "Need a hand?", text: "Open a support ticket in Discord and the appropriate team will help you." },
];

// Team tab. Delete every entry (Config.Team = [];) and the tab hides itself.
// "image" is optional - without it a coloured letter is shown instead.
Config.Team = [
  {
    name: "! 101 Tucker",
    description: ["Owner"],
    quote: "Community ownership and server direction",
    color: "#ff7a1a",
    image: "https://cdn.discordapp.com/avatars/1099651002208104488/3227c6962b202257f2f4ec712f9c485b.webp?size=1024",
  },
  {
    name: "! 102 cajunz",
    description: ["Owner"],
    quote: "Community ownership and operations",
    color: "#9d4dff",
    image: "https://cdn.discordapp.com/avatars/1090083387638812755/18a188b05c43be268a528ef1e3ae44de.webp?size=1024",
  },
  {
    name: "! 103 chronic",
    description: ["Co-Owner"],
    quote: "Staff oversight",
    color: "#24f336",
    image: "https://cdn.discordapp.com/avatars/589339360915095556/1260664b7631c53801833faba225f5b8.webp?size=1024",
  },
  {
    name: "! 104 Scarface",
    description: ["Co-Owner"],
    quote: "Gang and organization direction",
    color: "#2ecfe4",
    image: "https://cdn.discordapp.com/avatars/618108970086694928/0e7e257856add2521dd9be96d551b855.webp?size=1024",
  },
  {
    name: "! 105 Saif",
    description: ["Co-Owner"],
    quote: "Staff, development and management oversight",
    color: "#ca3813",
    image: "https://cdn.discordapp.com/avatars/1219625872449867776/f55ae3c6cc7a2a123a62e95fc2825f50.png?size=4096",
  },
];

/* ---------------- MUSIC ----------------
   Songs can be YouTube links or your own .mp4 files (see Config.Tracks below).
   The video plays as the background and the sound plays with it.
*/
Config.StartVolume = 15; // 0-100
Config.StartTrack = 0;   // number (0 = first song) or "random"

/* Each song is either a YouTube link ("youtube") or a video/audio file ("file").
   "youtube" accepts the full link or just the 11 character id. title / artist are shown in the player.
   Thumbnails come from YouTube automatically (set "poster" to use your own). */
/* YouTube does NOT play inside FiveM by itself (it shows "Error 153"). Fix: host the file
   host-this-online/yt-relay.html on any https website (GitHub Pages is free, see README.txt)
   and paste its full link here. Leave "" if you only use .mp4 files. */
Config.YouTubeRelay = "";

Config.Tracks = [
  { title: "Top (ft. Lil Durk)", artist: "Fredo Bang",   file: "assets/media/music/fredo-bang-top.webm",         poster: "assets/media/posters/fredo-bang-top.jpg",         length: "2:50" },
  { title: "I See Why",          artist: "Moneybagg Yo", file: "assets/media/music/moneybagg-yo-i-see-why.webm", poster: "assets/media/posters/moneybagg-yo-i-see-why.jpg", length: "3:04" },
  { title: "Deli",               artist: "Ice Spice",    file: "assets/media/music/ice-spice-deli.webm",         poster: "assets/media/posters/ice-spice-deli.jpg",         length: "2:08" },
  { title: "Shake",              artist: "IShowSpeed",   file: "assets/media/music/ishowspeed-shake.webm",       poster: "assets/media/posters/ishowspeed-shake.jpg",       length: "2:37" },
];

// Halloween effects. Set any to false if players with weak PCs struggle.
Config.Effects = {
  embers: true, // drifting sparks
  bats: true,   // a few bats fly across now and then
  fog: true,    // slow fog + candle flicker at the bottom
};
