# Florida Bay RP Tebex package setup kit

This is the source of truth for configuring project `1913588`. Package names must match this guide; after package creation, the Florida Bay bot pins each assigned Tebex package ID to the correct Discord entitlements.

## Files

- `package-settings.csv` — exact names, categories, prices, billing modes, slugs, images, and fulfillment modes.
- `package-images/` — 25 upload-ready transparent PNG package images, each exactly 165 × 165 pixels.
- `package-images/package-logo-contact-sheet.png` — visual index of the complete logo set; do not upload this as a package image.

## 1. Global project and checkout settings

Open **Settings → Checkout** and use these values:

| Setting | Value |
|---|---|
| Customer support email | A monitored Florida Bay store/support inbox |
| Default currency | USD |
| Additional currencies | None initially |
| Regional pricing | Off initially |
| Rounding | No rounding |
| Allow gifting | Off |
| Checkout dark mode | On |
| Sales-tax display | Exclusive pricing |
| Test mode | On only while the store is private and being tested; Off before launch |

Keep the project private while Test Mode is enabled. Enable the normal Tebex payment methods you want to accept; make sure at least one enabled method supports subscriptions.

## 2. Create the categories

Go to **Packages → Add New → Category** and create these in order. Use no parent category and leave the category image blank because the Florida Bay storefront uses the package art.

| Order | Category | Description | Restrict to one package | Every other category option |
|---:|---|---|---|---|
| 1 | Memberships | Recurring supporter memberships with Discord-based Florida Bay benefits. | On | Off |
| 2 | Vehicle Packs | Permanent access roles for curated vehicle collections. | Off | Off |
| 3 | Exclusive Perks | Individual access and recognition perks. | Off | Off |
| 4 | Custom Content | Premium content and organization entitlements. | Off | Off |
| 5 | DevOps Packages | One-time custom development services fulfilled through a DevOps ticket. | Off | Off |
| 6 | Business Slots | Approved business packages completed with the DevOps team. | Off | Off |

For every category set **Order Packages By** to **Manual**, keep it visible and enabled, and turn off cumulative pricing, tiers, purchase prerequisites, lower-price disabling, permanent cumulative discounts, pending-command deletion, and remaining-time carryover.

## 3. Universal package settings

These values apply to all 25 packages unless the package table says otherwise:

| Setting | Exact value |
|---|---|
| Currency | USD |
| Quantity lock | On; quantity 1 |
| Gifting | Off |
| Global purchase limit | None |
| Required packages | None |
| Custom variables | None — Discord identity is securely attached by the Florida Bay storefront |
| Deliverables / game commands / Discord actions | None — do not install the Tebex Discord bot and do not add per-package actions |
| Remove after | Never / blank |
| Visibility | Public; no publish window; not hidden; not disabled |
| Community goal | Off initially |
| Upsells | None initially |
| Server selection | All/default project server if Tebex requires a choice |

Automatic role packages use a lifetime user limit of **1**, with removed packages excluded from the limit so a refunded customer can buy again. Subscription packages use a user limit of **1 per month**, also excluding removed packages. Manual DevOps and Business Slot packages have no user limit because customers may commission more than one project over time.

## 4. Exact package matrix

Create each package using the exact spelling below, including apostrophes, spaces, and hyphens.

| # | Package | Category | Price | Payment option | User limit | Slug | Image | Fulfillment |
|---:|---|---|---:|---|---|---|---|---|
| 1 | Founder's Edition | Memberships | $49.99 | Recurring every 1 month | 1 per month | `founders-edition` | `founders-edition.png` | Automatic Founder bundle; excludes Any Organization |
| 2 | VIP Membership | Memberships | $14.99 | Recurring every 1 month | 1 per month | `vip-membership` | `vip-membership.png` | Automatic Discord role |
| 3 | Australian Vehicle Pack | Vehicle Packs | $15.00 | One-time | 1 lifetime | `australian-vehicle-pack` | `australian-vehicle-pack.png` | Automatic Discord role |
| 4 | UK Car Pack | Vehicle Packs | $15.00 | One-time | 1 lifetime | `uk-car-pack` | `uk-car-pack.png` | Automatic Discord role |
| 5 | JDM Car Pack | Vehicle Packs | $15.00 | One-time | 1 lifetime | `jdm-car-pack` | `jdm-car-pack.png` | Automatic Discord role |
| 6 | Aviation Pack | Vehicle Packs | $15.00 | One-time | 1 lifetime | `aviation-pack` | `aviation-pack.png` | Automatic Discord role |
| 7 | Queue Bypass | Exclusive Perks | $5.00 | Recurring every 1 month | 1 per month | `queue-bypass` | `queue-bypass.png` | Automatic Discord role |
| 8 | Whitelist Package | Exclusive Perks | $5.00 | Recurring every 1 month | 1 per month | `whitelist-package` | `whitelist-package.png` | Automatic Discord role |
| 9 | Streamer Package | Exclusive Perks | $10.00 | One-time | 1 lifetime | `streamer-package` | `streamer-package.png` | Automatic Discord role |
| 10 | Custom Weapons | Custom Content | $15.00 | One-time | 1 lifetime | `custom-weapons` | `custom-weapons.png` | Automatic Discord role |
| 11 | Any Organization | Custom Content | $25.00 | One-time | 1 lifetime | `any-organization` | `any-organization.png` | Automatic Discord role; not included with Founder |
| 12 | LEO Department | DevOps Packages | $45.00 | One-time | None | `leo-department` | `leo-department.png` | Manual DevOps ticket |
| 13 | Gang | DevOps Packages | $40.00 | One-time | None | `gang` | `gang.png` | Manual DevOps ticket |
| 14 | Business | DevOps Packages | $35.00 | One-time | None | `business` | `business.png` | Manual DevOps ticket |
| 15 | Headtag/Gangtag | DevOps Packages | $20.00 | One-time | None | `headtag-gangtag` | `headtag-gangtag.png` | Manual DevOps ticket |
| 16 | Personal Vehicle | DevOps Packages | $30.00 | One-time | None | `personal-vehicle` | `personal-vehicle.png` | Manual DevOps ticket |
| 17 | Bulletproof Add-on | DevOps Packages | $10.00 | One-time | None | `bulletproof-add-on` | `bulletproof-add-on.png` | Manual DevOps ticket |
| 18 | Custom Handling Add-on | DevOps Packages | $10.00 | One-time | None | `custom-handling-add-on` | `custom-handling-add-on.png` | Manual DevOps ticket |
| 19 | Custom Organization Bot | DevOps Packages | $50.00 | One-time | None | `custom-organization-bot` | `custom-organization-bot.png` | Manual DevOps ticket |
| 20 | Car Club | Business Slots | $35.00 | One-time | None | `car-club` | `car-club.png` | Manual DevOps ticket |
| 21 | Security | Business Slots | $25.00 | One-time | None | `security` | `security.png` | Manual DevOps ticket |
| 22 | Transport | Business Slots | $45.00 | One-time | None | `transport` | `transport.png` | Manual DevOps ticket |
| 23 | Miscellaneous Businesses | Business Slots | $25.00 | One-time | None | `miscellaneous-businesses` | `miscellaneous-businesses.png` | Manual DevOps ticket |
| 24 | German Car Pack | Vehicle Packs | $35.00 | One-time | 1 lifetime | `german-car-pack` | `german-car-pack.png` | Automatic Discord role |
| 25 | Mk2 Weapons | Custom Content | $15.00 | One-time | 1 lifetime | `mk2-weapons` | `mk2-weapons.png` | Automatic Discord role |
| 26 | DevOps+ | Exclusive Perks | $20.00 | Recurring every 1 month | 1 per month | `devops-plus` | `devops-plus.png` | Automatic Discord role |

### Automatic Discord role map

Do not configure these inside Tebex; this table is only for verifying what the Florida Bay bot will grant after a signed payment webhook.

| Package | Discord role behavior |
|---|---|
| Founder's Edition | Grants role `1570227921061150810` plus every paid role (all packs, Mk2 Weapons, DevOps+, Custom Weapons, Car Radio, etc.); only Any Organization `1570228686274175110` is excluded |
| VIP Membership | Grants `1570227967572054146` |
| Australian Vehicle Pack | Grants `1570227968293343327` |
| UK Car Pack | Grants `1570227969924931618` |
| JDM Car Pack | Grants `1570227984428834879` |
| Aviation Pack | Grants `1570227988119949438` |
| Queue Bypass | Grants `1570227972646903853` |
| Whitelist Package | Grants `1570227973292822558` |
| Streamer Package | Grants `1570227975696420935` |
| Custom Weapons | Grants `1570227975167942677` |
| Any Organization | Grants `1570228686274175110` |
| German Car Pack | Grants `1570227969048453171` |
| Mk2 Weapons | Grants `1570227974018572288` |
| DevOps+ | Grants `1570224070354542713` while the subscription is active |
| Every DevOps Package and Business Slot | No role; fulfilled manually after the buyer supplies the transaction ID in a DevOps ticket |

## 5. Copy-ready package descriptions

### Founder's Edition

Become one of Florida Bay's leading supporters and unlock the complete configured premium role bundle while your membership remains active.

• Founder's Edition recognition  
• VIP Membership benefits  
• Australian, UK, JDM, and Aviation vehicle-pack access  
• Queue Bypass, Whitelist, and Streamer roles  
• Custom Weapons access  
• Automatic delivery to the Discord account connected at checkout

This is a recurring monthly membership. Benefits are removed when the subscription ends, is refunded, or is successfully disputed. Any Organization is specifically excluded. All benefits remain subject to Florida Bay rules, approval requirements, and server availability.

### VIP Membership

Support Florida Bay's continued development and receive the VIP Membership role and all benefits currently configured for VIP members.

• VIP Discord recognition  
• Access to current VIP member benefits  
• Automatic delivery to the Discord account connected at checkout

This is a recurring monthly membership. Access remains active only while the subscription is active and is subject to Florida Bay rules and server availability.

### Australian Vehicle Pack

Unlock the Australian Vehicle Pack entitlement role and access the Australian vehicle collection currently available on Florida Bay.

This is a one-time purchase with automatic Discord role delivery. Vehicle availability, balancing, and individual models may change as the server evolves. All vehicles remain subject to server rules and roleplay restrictions.

### UK Car Pack

Unlock the UK Car Pack entitlement role and access the British vehicle collection currently available on Florida Bay.

This is a one-time purchase with automatic Discord role delivery. Vehicle availability, balancing, and individual models may change as the server evolves. All vehicles remain subject to server rules and roleplay restrictions.

### JDM Car Pack

Unlock the JDM Car Pack entitlement role and access the Japanese performance vehicle collection currently available on Florida Bay.

This is a one-time purchase with automatic Discord role delivery. Vehicle availability, balancing, and individual models may change as the server evolves. All vehicles remain subject to server rules and roleplay restrictions.

### Aviation Pack

Unlock the Aviation Pack entitlement role and access the aircraft collection currently available to eligible Florida Bay players.

This is a one-time purchase with automatic Discord role delivery. Aircraft access remains subject to server rules, training or licensing requirements, and current server availability.

### Queue Bypass

Receive the Queue Bypass role while this membership remains active, giving your account the configured priority benefit when joining Florida Bay.

This is a recurring monthly subscription with automatic Discord role delivery. Queue Bypass does not guarantee immediate entry during outages, maintenance, reserved events, or full-capacity conditions.

### Whitelist Package

Receive the Whitelist Package role while this membership remains active and unlock the whitelist access currently configured by Florida Bay.

This is a recurring monthly subscription with automatic Discord role delivery. Whitelist access does not exempt a player from applications, eligibility checks, community rules, or moderation decisions.

### Streamer Package

Receive the Streamer Package role and unlock the recognition and creator benefits currently configured for Florida Bay streamers.

This is a one-time purchase with automatic Discord role delivery. Creator activity must follow Florida Bay's streaming, privacy, and community rules, and some opportunities may require staff approval.

### Custom Weapons

Unlock the Custom Weapons entitlement role and access the custom weapon content currently available on Florida Bay.

This is a one-time digital entitlement with automatic Discord role delivery; no real-world item is included. Content access, balancing, and availability remain subject to server rules and may change as the server evolves.


### German Car Pack

Unlock the German Car Pack entitlement role and access the BMW and Mercedes-Benz vehicle collection in the Florida Bay donator menu.

This is a one-time purchase with automatic Discord role delivery. Vehicle availability, balancing, and individual models may change as the server evolves. All vehicles remain subject to server rules and roleplay restrictions.

### Mk2 Weapons

Unlock the Mk2 Weapons entitlement role and access the Mk2 weapon content currently available on Florida Bay.

This is a one-time purchase with automatic Discord role delivery. Weapon availability and balancing may change, and all weapons remain subject to server rules and roleplay restrictions.
### DevOps+

Receive the DevOps+ role while this membership remains active.

This is a recurring monthly subscription with automatic Discord role delivery. The role is removed when the subscription ends or the payment is refunded or disputed.

### Any Organization

Receive the Any Organization entitlement role for an eligible custom organization on Florida Bay.

The purchase role is delivered automatically to the Discord account connected at checkout. Organization approval, scope, placement, and setup remain subject to staff review and server availability. This package is not included with Founder's Edition.

### LEO Department

Commission an approved custom law-enforcement department implementation from the Florida Bay DevOps team.

After checkout, join the DevOps Discord at https://discord.gg/4gCvKJRGxk, open a ticket, and provide your Tebex transaction ID plus the department name, concept, hierarchy, branding, and requested scope. Work begins only after approval and scope confirmation. Delivery is manual and timing depends on complexity and the development queue.

### Gang

Commission an approved custom gang implementation from the Florida Bay DevOps team.

After checkout, join the DevOps Discord at https://discord.gg/4gCvKJRGxk, open a ticket, and provide your Tebex transaction ID plus the gang name, concept, branding, hierarchy, colors, and requested scope. Work begins only after approval and scope confirmation. Delivery is manual and timing depends on complexity and the development queue.

### Business

Commission an approved custom business implementation from the Florida Bay DevOps team.

After checkout, join the DevOps Discord at https://discord.gg/4gCvKJRGxk, open a ticket, and provide your Tebex transaction ID plus the business name, concept, branding, operating plan, and requested features. Work begins only after approval and scope confirmation. Delivery is manual and timing depends on complexity and the development queue.

### Headtag/Gangtag

Commission one approved custom headtag or gangtag for use on Florida Bay.

After checkout, join the DevOps Discord at https://discord.gg/4gCvKJRGxk, open a ticket, and provide your Tebex transaction ID, the exact requested wording, colors, style references, and the account or organization receiving it. Delivery is manual and all tags require content and visibility approval.

### Personal Vehicle

Commission one approved personal vehicle installation for Florida Bay.

After checkout, join the DevOps Discord at https://discord.gg/4gCvKJRGxk, open a ticket, and provide your Tebex transaction ID, vehicle files or approved source, model details, and intended owner. The customer is responsible for having permission to use supplied assets. Delivery is manual and subject to technical, quality, size, balance, and content review.

### Bulletproof Add-on

Add approved bullet-resistant configuration to one supported personal vehicle.

This is an add-on, not a standalone vehicle. After checkout, open a DevOps ticket at https://discord.gg/4gCvKJRGxk with your transaction ID and the target personal vehicle. Delivery is manual and subject to compatibility, balance, and staff approval.

### Custom Handling Add-on

Commission one approved custom handling tune for a supported personal vehicle.

This is an add-on, not a standalone vehicle. After checkout, open a DevOps ticket at https://discord.gg/4gCvKJRGxk with your transaction ID, target vehicle, and desired handling characteristics. Final values are subject to testing, balance, realism, and staff approval.

### Custom Organization Bot

Commission one custom Discord bot for an approved Florida Bay organization, built to an agreed one-time scope.

After checkout, join the DevOps Discord at https://discord.gg/4gCvKJRGxk, open a ticket, and provide your Tebex transaction ID, organization details, required workflows, commands, permissions, and branding. Delivery is manual. The bot is removed if the associated organization shuts down, and additional work outside the agreed scope may require a separate purchase.

### Car Club

Open an approved Florida Bay car club with the following included setup:

• 1 Headtag  
• 1 EUP slot  
• 1 Tag  
• 3 Personal Vehicle slots

After checkout, open a DevOps ticket at https://discord.gg/4gCvKJRGxk and provide your Tebex transaction ID, club name, branding, leadership, and setup requirements. Delivery is manual and subject to approval and server availability.

### Security

Open an approved Florida Bay security business with the following included setup:

• 1 Headtag  
• 1 EUP slot  
• 1 Tag

After checkout, open a DevOps ticket at https://discord.gg/4gCvKJRGxk and provide your Tebex transaction ID, business name, branding, leadership, and operating plan. Delivery is manual and subject to approval and server availability.

### Transport

Open an approved Florida Bay transport business with the following included setup:

• 1 Headtag  
• 1 EUP slot  
• 1 Tag  
• 4 Personal Vehicle slots

After checkout, open a DevOps ticket at https://discord.gg/4gCvKJRGxk and provide your Tebex transaction ID, business name, branding, leadership, and operating plan. Delivery is manual and subject to approval and server availability.

### Miscellaneous Businesses

Open an approved miscellaneous Florida Bay business with the following flat-price setup:

• 1 Headtag  
• 2 EUP slots  
• YMAP included

After checkout, open a DevOps ticket at https://discord.gg/4gCvKJRGxk and provide your Tebex transaction ID, business concept, desired location, branding, leadership, and operating plan. Delivery is manual and subject to map feasibility, approval, and server availability.

## 6. Create each package in Tebex

Repeat this process for every row in the package matrix:

1. Open **Packages → Add New → Package**.
2. Copy the package name exactly.
3. Paste its description from this guide.
4. Select the listed category.
5. Upload the listed PNG from `package-images/`.
6. Enter the listed USD price.
7. Select **One-Time Payment** or **Recurring Subscription** exactly as listed. For recurring packages, set **Charge Every** to **1 month** and leave **Remove After** blank.
8. Enable **Quantity Lock** and set quantity to 1.
9. Disable gifting for the package.
10. Apply the listed user limit and enable exclusion of removed packages from limit tracking.
11. Leave required packages, variables, commands, Discord actions, downloads, license keys, and other deliverables empty.
12. Set the custom URL slug from the matrix.
13. Leave the package visible and enabled, with no publish/expiry window.
14. Save the package and keep it in the matrix order inside its category.

## 7. Webhook settings

Open **Developers → Webhooks → Endpoints**, select the Florida Bay endpoint, and subscribe it to:

- `payment.completed`
- `payment.refunded`
- `payment.dispute.opened`
- `payment.dispute.won`
- `payment.dispute.lost`
- `payment.dispute.closed`
- `recurring-payment.started`
- `recurring-payment.renewed`
- `recurring-payment.ended`

Click **Validate** after saving. The endpoint must show as validated before Tebex sends live events. The Florida Bay service already verifies the raw-body `X-Signature`, records events idempotently, and reconciles active roles.

## 8. Safe end-to-end testing

1. Keep the store private.
2. Go to **Settings → Checkout** and enable Test Mode.
3. Sign into `https://store.floridabay.net` with a test Discord account that is already in the main Florida Bay Discord.
4. Purchase one one-time role package and confirm its Discord role arrives.
5. Purchase one monthly package and confirm its role arrives.
6. From Tebex, send or exercise refund/end events and confirm the corresponding bot-managed role is removed.
7. Buy one DevOps package and confirm no Discord entitlement role is granted; verify the receipt shows a transaction ID and the product description directs the buyer to the DevOps Discord.
8. Remove the test payments from the Tebex Checkout settings when finished.
9. Disable Test Mode before making the store public.

Do not use Manual Payments to test this custom fulfillment flow because Tebex documents that manual payments do not trigger webhooks.

## 9. Verify the live catalog

From `services/fbrp-bot`, run `npm run verify:tebex` with the production `.env` present. The verifier checks the project, category order, all 25 stable package IDs, names, categories, slugs, USD prices, billing modes, quantity and gifting locks, purchase limits, subscription intervals, descriptions, and images against this setup kit. Treat any mismatch as a launch blocker.
