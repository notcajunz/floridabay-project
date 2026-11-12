Config = {}; // Don't touch

/* ------------------------------------------------------------------
   FLORIDA BAY ROLEPLAY (FBRP) - LOADING SCREEN CONFIG
   Everything you normally need to edit lives in this file.
------------------------------------------------------------------- */

Config.Discord = "https://discord.gg/floridabay"; // Discord button (bottom of the logo)
Config.Website = "https://floridabay.net/";       // Website button

Config.HideoverlayKeybind = 112; // F1 hides / shows the menu

// Text under the logo
Config.Eyebrow = "Welcome to the Sunshine State";
Config.Pitch = "Welcome to the bay. While your city loads in, look through the tabs, pick a song, or come hang out with us on Discord.";

// Welcome tab
Config.Welcome = {
  title: "Welcome to Florida Bay Roleplay",
  text: "Thanks for joining FBRP. Take your time while everything loads in. Read through the updates, meet the team and pick a song from the Music tab.<br><br>For the best experience, join our Discord: discord.gg/floridabay",
  // "Getting started" cards under the text (delete the list to hide them). EDIT THESE - placeholders.
  steps: [
    { title: "Join the Discord", text: "Support, updates and community events all live in our Discord server." },
    { title: "Read the rules", text: "Know the rules before you load in so your first night goes smoothly." },
    { title: "Make your character", text: "Build your story and jump into the bay." },
  ],
};

// Banner on the Welcome tab (turn on whenever you run a sale / event)
Config.Sales = {
  active: false, // true = show banner now
  text: "SALE: check the Discord for details!",
  link: Config.Discord,

  // Scheduled banner (shown automatically between startDate and startDate + durationDays)
  upcoming: {
    enabled: false,
    startDate: "2026-12-01T05:00:00Z", // UTC
    durationDays: 3,
    text: "SALE: check the Discord for details!",
    link: Config.Discord,
  },
};

// Updates tab. Add "image" (URL or assets path) to a post if you want a picture.
// EDIT THESE - they are placeholders.
Config.Updates = [
  { title: "Sun is out", text: "Keep an eye on our Discord for events, giveaways and server announcements." },
  { title: "Join the Discord", text: "Applications, support and all the latest news live in our Discord server." },
  { title: "Read the rules", text: "Make sure you have read the server rules before you jump in." },
  { title: "Need help?", text: "Ask in the Discord and a staff member will point you in the right direction." },
];

// Team tab. Delete every entry (Config.Team = [];) and the tab hides itself.
// "image" is optional - without it a coloured letter is shown instead.
// EDIT THESE - they are placeholders.
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
    name: "! 103 Scarface",
    description: ["Co-Owner"],
    quote: "Gang and organization direction",
    color: "#2ecfe4",
    image: "https://cdn.discordapp.com/avatars/618108970086694928/0e7e257856add2521dd9be96d551b855.webp?size=1024",
  },
  {
    name: "! 104 Saif",
    description: ["Co-Owner"],
    quote: "Staff, development and management oversight",
    color: "#ca3813",
    image: "https://cdn.discordapp.com/avatars/1219625872449867776/f55ae3c6cc7a2a123a62e95fc2825f50.png?size=4096",
  },
  {
    name: "! 106 Revan",
    description: ["Executive Management"],
    quote: "Department Director & Sales",
    color: "#9ca3af",
    image: "https://cdn.discordapp.com/avatars/792013141290516490/a_46a35cb6d0998952a7e0178e20fec389.png?size=1024",
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
  { title: "Timeless", artist: "The Weeknd, Playboi Carti", file: "assets/media/music/timeless.webm", poster: "assets/media/posters/timeless.jpg", length: "4:16" },
  { title: "Sprinter", artist: "Central Cee x Dave", file: "assets/media/music/sprinter.webm", poster: "assets/media/posters/sprinter.jpg", length: "3:49" },
  { title: "Dai Dai", artist: "Shakira, Burna Boy", file: "assets/media/music/daidai.webm", poster: "assets/media/posters/daidai.jpg", length: "4:00" },
  { title: "a lot (ft. J. Cole)", artist: "21 Savage", file: "assets/media/music/alot.webm", poster: "assets/media/posters/alot.jpg", length: "6:32" },
  { title: "In Da Club", artist: "50 Cent", file: "assets/media/music/indaclub.webm", poster: "assets/media/posters/indaclub.jpg", length: "4:08" },
];

// Background. "scene" = the beach / sunset drawn in code (your song plays behind it).
//             "video" = show the song's video as the background instead.
Config.Background = "scene";
Config.BannerText = "WELCOME TO FLORIDA BAY"; // text on the banner the little plane pulls

// Beach effects. Set any to false if players with weak PCs struggle.
Config.Effects = {
  waves: true,   // moving water
  clouds: true,
  birds: true,   // gulls + pelicans
  plane: true,   // banner plane
  palms: true,   // swaying palm fronds on the sides
  sunset: true,  // sky slowly turns to sunset as the load bar fills
  blur: true,    // frosted-glass panels (turn off to be lighter on the GPU)
};
