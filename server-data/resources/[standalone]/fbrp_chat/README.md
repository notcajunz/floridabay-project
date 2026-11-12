# fbrp_chat

Florida Bay chat. Replaces the cfx `chat` resource, `jaxtti_chat` and the old `fbrp_chat` in one resource.
It `provide`s `chat`, so scripts that depend on chat or send chat events keep working.

## Install
1. Remove (or stop ensuring) the default `chat` resource, `jaxtti_chat`, and the old `fbrp_chat`.
2. Drop this `fbrp_chat` in and ensure it after ox_lib, before your other scripts:
   ```
   ensure ox_lib
   ensure fbrp_chat
   ensure fbrp_core
   ```

## Players
T opens chat, L cycles visibility (fade / always / hidden). Everyone sees the same style (`Config.Style`, minimal).

## Commands
/ooc (or just type), /me, /do (nearby + above your head), /gme, /twt /twitter /tweet /twtname, /instagram,
/youtube, /tiktok, /twitch, /ad, /news, /vpn (ad with your name hidden), /darkweb, /sms, /reply, /chattag (opens fbrp_core's tag menu).
Staff: /staff, /allstaff, /ondutystaff, /mute, /unmute, /chatclear, /hidestaffrank. LEO: /leoannounce, /1099.

## Where the data comes from
Staff rank + on-duty and LEO duty come from fbrp_core. Badges are the staff rank (while clocked in) and the
chat tag picked in fbrp_core's tag menu. Everything else is in `config.lua`.
