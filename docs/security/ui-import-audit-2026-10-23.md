# UI import security audit — 2026-10-23

## Inputs

| Archive | SHA-256 |
|---|---|
| `jaxtti_priorityhud.zip` | `102109cdc19e75f67eb9c665cf0ad73ea0e31f4a86a7545ab2553aa424db75c3` |
| `fbrp-loadingscreen.zip` | `4509e4dd64b8a47cd516e3f022eaeaa3e58107dbf279cfd2f26255f7c3767b8b` |

Both ZIP CRC tests passed. Neither archive contains absolute paths, parent-directory traversal, backslash path confusion, symlinks, or executable file permissions.

## Checks performed

- Inventoried every archive member and detected its file type after extraction into a mode-`0700` temporary directory.
- Reviewed the custom Lua, JavaScript, HTML, CSS, manifests, and configuration for process execution, dynamic code loading, filesystem writes, resource writes, credential collection, webhook exfiltration, hidden persistence, and obfuscation.
- Enumerated all network-capable behavior and URLs.
- Checked JavaScript syntax after integration.
- Validated the imported font headers and inspected embedded strings.
- Compared the supplied minified jQuery 3.6.0 byte-for-byte with the official `code.jquery.com` distribution; the hashes matched (`ff1523fb7389539c84c65aba19260648793bb4f5e29329d2ee8804bc37a3fe6e`). The library was not needed and was not shipped in the final HUD integration.
- Added regression tests that confirm the new HUD reads Florida Bay's existing replicated state instead of introducing a second command/state backend.

No antivirus/YARA engine was installed on the control host, so this is a source, structure, integrity, and behavior audit rather than a signature-database scan.

## Findings and treatment

- No credential theft, command execution, dynamic Lua loading, webhook posting, persistence, destructive behavior, or deliberately obfuscated custom code was found.
- The supplied HUD backend was not malicious, but it was incompatible with Florida Bay: it duplicated AOP/priority commands and depended on resources that are not part of this deployment. None of that backend was imported. Only its presentation direction and the supplied open-source Poppins fonts were used.
- The loading screen's YouTube relay intentionally loads YouTube's iframe API and exchanges `postMessage` events with its parent. This behavior was retained at the owner's request. The integrated version pins the expected relay origin, validates the message source, validates YouTube IDs/numeric arguments, restricts external links to HTTPS, and adds content-security policies.
- Discord-hosted team avatars and YouTube thumbnail/API URLs are expected external content. No webhook URLs or secrets are present.
- The supplied local music/video files are ordinary WebM/MP4 media by header/file-type inspection. Only the referenced WebM copies are shipped; duplicate MP4 copies were excluded. Media licensing and copyright ownership are outside the scope of a malware audit and should be confirmed by the owner.
- Obsolete loading-screen jQuery, videos, decorative images, and icons that the new page does not reference were removed from the client download set.

## Result

No malicious behavior was identified in the reviewed source. The production integration uses the minimum required files, preserves the requested YouTube relay with additional validation, and leaves all authoritative roleplay state and permissions in the existing Florida Bay systems.
