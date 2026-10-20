# Sky Phone on Florida Bay Roleplay

This is the official Sky Phone 1.1.7 release package
(`sky_phone-1.1.7.zip`, SHA-256
`88b1ffeea8164f67e881fd3d73847ffe2b14c3e8e164886f4e01ef8a7cbc8840`,
source commit in `SOURCE.txt`), licensed GPL-3.0. Florida Bay runs the
standalone `fbrp_core` framework instead of ESX/QBCore/Qbox, so a small bridge
was added. Keep these changes when updating to a newer release.

## Character phones

`fbrp_core` publishes the selected character on the player's state bag
(`fbrp:characterId`). The `fbrp` framework adapter turns that into the phone
owner identifier `fbrp_char_<id>`, and the `fbrp` inventory adapter gives every
player with a selected character exactly one virtual phone. With
`Config.Phone.Unique = false` and SIM cards disabled, each character owns one
persistent device with its own automatic number, account, contacts, messages,
calls, photos, notes and settings. Choosing a different character at spawn
loads that character's phone; nothing carries over between characters.

When `fbrp_core` fires `fbrp:characterSelected`, the phone ends any call and
closes the previous character's session, then issues the new character's
device and number immediately so it can be called before it is first opened.
The number is mirrored onto the citizen record (`character_profiles.phone`), so
ID cards and the MDT phone lookup show the real number.

## Changed files

- `source/bridge/server/framework.lua`, `source/bridge/client/framework.lua`:
  accept the `fbrp` framework (notifications use `fbrp:notify`; dead/cuffed
  status comes from `fbrp:downed` and `fbrp:restrained`).
- `source/bridge/server/frameworks/fbrp.lua` (new): identifiers, character
  names, duty organization as the phone job, character-switch handling.
- `source/bridge/inventory.lua`, `source/bridge/server/inventory/fbrp.lua`
  (new): the virtual one-phone inventory.
- `source/server/phone.lua`: `SkyPhone.ProvisionCharacter` and the
  `sky_phone:fbrp:characterChanged` session reset.
- `fxmanifest.lua`: depends on `fbrp_core` and `pma-voice`.
- `config/config.lua`: file mode, fbrp framework/inventory, Up-arrow keybind
  (F1 is vMenu), Hold-to-look off (Left Alt is the third eye), `305` numbers,
  Florida Bay companies (police = every law enforcement org on duty, fire =
  fire/rescue), and no banking, billing, crypto, SkyRide, CityMarkt, Local Pages, Health,
  CrewLink, Flare, garage, housing or radio apps (no personal money, no framework garages, and the F2 radio owns
  pma-voice radio). Password peppers come from server-only convars.

## Server configuration

`server-data/config/phone.cfg` holds the ACE grants and `ensure sky_phone`;
`server.cfg` execs it after `ensure fbrp_core`. The four
`sky_phone_*_pepper` convars live in the private `secrets.cfg`
(see `secrets.cfg.example`).
