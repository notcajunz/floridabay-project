FLORIDA BAY ROLEPLAY - LOADING SCREEN
=====================================
Install: put this whole folder in your server's resources folder and add
    ensure fbrp-loadingscreen        (or: start fbrp-loadingscreen)
to server.cfg. Remove your old loading screen resource.

LOGO:  assets/media/logo.webm (transparent) and logo.mp4 (fallback) are the Florida Bay Roleplay logo video. Replace both to change it.
SONGS: drop files into assets/media/music/ (see DROP-SONGS-HERE.txt in that folder).

Edit everything in assets/scripts/config.js:
  - Config.Discord / Config.Website   -> the two buttons under the logo
  - Config.Welcome / Updates / Team   -> panel tabs (Updates + Team are placeholders, edit them)
  - Config.Tracks                     -> the songs (see below)
  - Config.Effects                    -> turn waves / clouds / birds / plane / palms off for weak PCs
  - Config.Background               -> "scene" (beach) or "video" (show the song video)
  - Config.StartVolume, Config.StartTrack

Adding a song:
  YouTube:  add  { title: "Name", artist: "Artist", youtube: "https://youtu.be/XXXXXXXXXXX" }  to Config.Tracks.
            Players need internet. Some videos (e.g. VEVO) block embedding and will be skipped.
  File:     put an .mp4 in assets/media/music/ and add  { title, artist, file: "assets/media/music/name.mp4" }.
            Keep files small (~20 MB): every player downloads them when they join.

YOUTUBE SONGS (fixes "Video player configuration error 153")
  YouTube blocks its player inside FiveM's own page. To make YouTube songs work:
  1. Make a free GitHub account, create a new public repository (e.g. fbrp-music).
  2. Upload host-this-online/yt-relay.html to it (Add file > Upload files).
  3. Repo Settings > Pages > Deploy from branch "main" / root. Wait ~1 minute.
  4. Your link will be https://YOURNAME.github.io/fbrp-music/yt-relay.html
  5. Paste that link into Config.YouTubeRelay in assets/scripts/config.js, restart the resource.
  Videos whose owner disabled embedding (error 101/150) still cannot play; use an .mp4 for those.
