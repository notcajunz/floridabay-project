# dpClothing+ for Florida Bay

This resource is based on [andristum/dpclothing](https://github.com/andristum/dpclothing)
at commit `62d24c3b67c6e3cb6315fcb3162978125e858487` (upstream version 1.0.3).

Florida Bay keeps it as a separate resource so its upstream globals cannot
collide with `fbrp_core`. `fbrp_core` declares it as a dependency, which starts
the clothing resource automatically without putting deployment-specific
configuration into the tracked repository.

Local compatibility changes include FiveM-rebindable controls, Florida Bay
notifications and custody checks, safe state resets when characters or
server-owned outfits change, a bounded animation loader, and fixes for the
upstream saved-clothing restore paths.
