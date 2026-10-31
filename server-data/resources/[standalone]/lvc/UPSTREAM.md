# Luxart Vehicle Control

Vendored from the official Luxart Vehicle Control **v3.2.9 Rev2** release:

- Release: <https://github.com/TrevorBarns/luxart-vehicle-control/releases/tag/3.2.9>
- Base archive SHA-256: `5ab6d09d98ba623c97358a1a0a379594f67a36114a2628260e92e91fcb8725e4`
- Linux manifest archive SHA-256: `f2ac7a7453dd2a8d443f7a3e2f204a205204fcccc3fb8f4a24364d780527859d`

Florida Bay uses the official explicit Linux manifest with the uninstalled
optional-plugin entries removed, `community_id` set to `FBRP`, and beta update
notifications disabled. The base resource remains licensed under GPL-3.0-or-later.
The upstream vehicle-exit handler's undefined `ped` variable is corrected to
its existing `playerped` value to prevent a client runtime error.
Emergency-vehicle checks also consult Florida Bay's personal-vehicle
classification export before falling back to GTA vehicle class 18.
