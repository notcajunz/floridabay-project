# Claude Cowork prompt: build the Florida Bay Tebex catalog

Use this prompt in Claude Cowork with browser access and access to this repository:

```text
Use my browser to finish the Florida Bay Roleplay Tebex catalog for me. This is an execution task, not a plan: work through the entire catalog, save every category and package, and verify the final result before reporting back.

Authoritative files:
- /home/ubuntu/fbrp/docs/tebex/README.md — exact category settings, package names, prices, payment types, limits, slugs, full descriptions, webhook checklist, and verification procedure
- /home/ubuntu/fbrp/docs/tebex/package-settings.csv — compact package matrix and required ordering
- /home/ubuntu/fbrp/docs/tebex/package-images/ — the 25 already-generated product images; upload the PNG whose filename exactly matches each package's Image field

There are exactly 25 packages, not 24. Reconcile the browser state against the CSV before changing anything. If a matching category or package already exists, update it in place instead of creating a duplicate. Never delete an existing category/package unless I explicitly approve that deletion.

Complete these actions:
1. Open the correct Florida Bay Tebex project/store in the browser. If login, CAPTCHA, 2FA, or an account/store choice requires me, pause only for that interaction and then continue from where you stopped.
2. Create or correct the six categories in the exact order and with the exact settings in README.md: Memberships, Vehicle Packs, Exclusive Perks, Custom Content, DevOps Packages, and Business Slots.
3. Create or correct all 25 packages in package-settings.csv order. For every package, use the exact name, category, USD price, one-time/monthly payment option, purchase limit, slug, and complete copy-ready description from README.md.
4. Upload the exact local PNG listed in the package matrix. Confirm the image preview belongs to that product before saving; do not use generic web images, screenshots, or substitute artwork.
5. Apply the universal settings from README.md: quantity locked to 1; gifting off; public/visible and enabled with no publish window; no required packages, custom variables, game commands, Discord actions, downloads, license keys, community goal, or upsells; removed packages excluded from purchase-limit tracking. Leave Remove After blank/never.
6. Do not install the Tebex Discord bot and do not add package commands or role actions. Florida Bay's signed webhook service owns fulfillment.
7. Keep the store in its current public/private state. Do not publish, unpublish, change billing, buy anything, rotate secrets, replace webhook secrets, or change unrelated store branding/settings.
8. Inspect Developers > Webhooks without exposing secrets. If the Florida Bay endpoint already exists, ensure the exact events in README.md are selected and use Tebex's Validate control. If creating or changing the endpoint would require a URL or secret not already present, stop and ask me instead of guessing.
9. Verify the completed catalog against both source files: exactly 6 categories, exactly 25 unique package names/slugs, correct category/order, price and billing cadence, limits, descriptions, and a successfully uploaded matching image for every package. Re-open several saved packages across all categories to make sure Tebex persisted the settings.

Maintain a checklist as you work so no package is skipped. At the end, report: categories created/updated, all 25 package names with created/updated status, image-upload result for each, webhook validation result, any blockers, and any setting Tebex's current UI names differently from the guide. Do not claim completion unless all 25 package records and images have been verified in the browser.
```
