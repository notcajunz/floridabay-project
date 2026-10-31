# Florida Bay website design system: Saltline

Saltline is the product system for every Florida Bay web surface except the public landing page. It takes its cues from a working Gulf Coast marina after dark: black-painted hardware, sun-bleached limestone, navigation markers, tide charts, and one warm coral signal color. It is an operations interface, not a themed poster.

The landing page is explicitly outside this system. `index.html`, `landing.js`, `site.css`, `ui.css`, `ui.js`, `florida.css`, and `florida.js` remain the landing baseline. Redesigned pages opt into `/v2/design-system.css`, `/v2/responsive.css`, and `/v2/app-shell.js`; they do not alter the landing dependencies.

## Principles

1. **One job per screen.** The page title, primary action, and first content region establish the focal point. Supporting information is quieter and denser.
2. **Structure before decoration.** Solid fills, 1 px rules, alignment, type, and whitespace create hierarchy. No ornamental gradients, glow, glass, or perspective effects.
3. **Coastal, not costume.** Gulf references appear as mineral neutrals, coral markers, compact coordinate-like labels, and nautical rule lines—not palm-tree clip art.
4. **Dense where comparison matters.** Rosters, permissions, transactions, settings, submissions, and logs use rows and tables. Cards are reserved for distinct concepts or actions.
5. **Behavior stays boring.** Controls have conventional placement, clear labels, visible state, and predictable motion.

## Tokens

### Color

| Token | Value | Use |
| --- | --- | --- |
| `--sl-ink` | `#0a0c0d` | App background and navigation |
| `--sl-ink-raised` | `#111416` | Raised dark surfaces |
| `--sl-canvas` | `#171a1c` | Main work surface |
| `--sl-panel` | `#1d2123` | Cards, sheets, inputs |
| `--sl-panel-strong` | `#252a2d` | Hover and selected rows |
| `--sl-line` | `#343a3d` | Default borders |
| `--sl-line-strong` | `#4a5154` | Emphasized borders |
| `--sl-text` | `#f5f0e7` | Primary text (limestone) |
| `--sl-text-2` | `#b8b5ae` | Secondary text |
| `--sl-text-3` | `#85847f` | Tertiary labels |
| `--sl-coral` | `#ff6b4a` | Primary action and active marker |
| `--sl-coral-strong` | `#e85434` | Primary hover |
| `--sl-sea` | `#61c8b7` | Success, live, verified (rare) |
| `--sl-warn` | `#e8b95b` | Warning |
| `--sl-danger` | `#f06a72` | Destructive and error |
| `--sl-discord` | `#6f7ff5` | Discord identity actions only |

There are no decorative gradients. Alpha color is used only for state backgrounds and overlays. Text and interactive controls meet WCAG AA against their surfaces.

### Type

- Display: Bricolage Grotesque, 700. Tight tracking; used for page titles and major figures only.
- UI/body: Inter, 400–700. Sentence case throughout.
- Data: JetBrains Mono, 500–700. IDs, money, counts, timestamps, coordinates, and technical values.
- Instrument Serif is not used in application surfaces.

Scale: 12, 13, 15, 18, 24, 32, and 48 px. Body text is 15 px / 1.55. Page titles are 32 px desktop and 24 px mobile. Large public-store display copy may reach 48 px.

### Spacing

An 8 px base grid: 4, 8, 12, 16, 24, 32, 48, 64. Component interiors use 12–24 px. Major page regions use 32–48 px. Dense rows are 48–56 px high.

### Radius and elevation

- 6 px: buttons, inputs, badges, table selections.
- 10 px: cards and menus.
- 14 px: large dialogs and feature panels.
- Circular only: avatars, status dots, icon-only round buttons.
- Elevation: `0 12px 32px rgba(0,0,0,.28)` for menus/dialogs only. Normal cards use borders, not shadows.

### Motion

- 120 ms for hover/focus color and border changes.
- 160 ms ease-out for drawers, dialogs, and disclosure.
- A single 180 ms page entrance: opacity plus 6 px vertical movement.
- No tilt, parallax, floating, pulsing glows, or looping decoration.
- Under `prefers-reduced-motion: reduce`, all nonessential transitions and animations stop.

### Iconography

Inline outline SVGs only, Lucide-like geometry, 1.5 px stroke, 16/18/20 px sizes. Icons support labels; they do not replace important text. Emoji are never UI icons.

## Shell

Desktop app surfaces use a fixed 256 px black navigation rail and a sticky 72 px work header. Content is left-aligned with a maximum readable width of 1440 px. Active navigation is a solid raised row with a 2 px coral marker.

At 1024 px, the rail narrows or becomes a drawer depending on the page. At 768 px and below it becomes an off-canvas drawer. At 390 px, the header is 64 px high, page padding is 16 px, primary actions can pin to the bottom safe area, and comparison tables scroll rather than collapse into ambiguous cards.

## Components

- **Buttons:** 40 px default, 32 px small, 48 px large. Primary is coral with dark ink text; secondary is a solid raised panel; ghost is text with a hover fill; danger uses danger text/border. Loading keeps width and replaces the leading icon with a 14 px spinner.
- **Inputs/selects:** 42 px, solid panel, 1 px line, 6 px radius. Focus uses a 2 px coral ring with 2 px offset. Labels sit above fields; help and error text sit below.
- **Toggle:** 36×20 px track with a 16 px thumb; coral when enabled. The text label remains the larger click target.
- **Tabs/segments:** compact horizontal list with a bottom rule or solid selected cell. Counts use mono.
- **Tables:** sticky header where useful, 12 px uppercase column labels, 52 px rows, tabular values, row hover only. Mobile keeps semantic tables in a horizontal scroll region.
- **Card:** solid panel, 1 px line, 10 px radius. Cards do not all share equal height. Card headers use a title and optional right-aligned action.
- **Badge:** 24 px, 6 px radius, no default dot. State colors are semantic only.
- **Avatar and identity chip:** avatar + display name + Discord handle/ID. IDs use mono and offer an explicit copy affordance.
- **Dialog/sheet:** centered dialog up to 640 px or right sheet up to 560 px. Solid backdrop, labeled close control, sticky action footer.
- **Toast:** bottom-right desktop, bottom safe-area mobile; solid panel, left state rule, maximum two lines.
- **Tooltip:** plain dark label after a short hover/focus delay; never required to understand a control.
- **Pagination:** previous/next plus current position. Disabled controls remain visible.
- **Skeleton:** static neutral blocks with a subtle one-pass entrance; no endless shimmer.
- **Empty/loading/error:** icon, direct title, one useful sentence, and an action when recovery is possible.

## Page plan and audit

### Member portal

Current problems: a decorative login illustration overwhelms the task; the dashboard is a wall of equal stat cards; colorful tones imply meaning inconsistently; long staff tools lack density; mobile is a compressed desktop shell.

Plan: use the Saltline rail, a restrained split sign-in, an asymmetric dashboard with a single account summary and compact stat strip, dense activity/actions, stronger table and roster treatment, consistent modal forms, and a mobile drawer with app-like spacing.

### Organizations

Current problems: floating background orbs and glass panels compete with organization data; directory, wallet, shop, roster, permissions, and badges have similar visual weight.

Plan: remove atmospheric decoration; make the directory a structured editorial index; give organization workspaces a clear header, restrained balance summary, tab rail, dense rosters and permission grids, and purpose-built shop/badge work areas.

### Store

Current problems: the large centered hero delays the catalog; product cards, supporter pass, trust messaging, and cart all compete; rounded styling makes commerce controls feel promotional rather than dependable.

Plan: put catalog utility first, use an editorial left-aligned intro, persistent category rail, calm product grid, clear mono prices, and a solid cart sheet with a strong order summary.

### Control panel

Current problems: navigation and content are visually similar; nested settings are card-heavy; save state and dangerous actions are not distinct enough.

Plan: use the same app shell as the portal, denser settings rows, sticky save context, clearer section hierarchy, and a disciplined edit sheet.

### Verify and callback

Current problems: generic centered glass cards and unnecessary atmosphere for a single task.

Plan: a compact identity handoff panel with numbered steps, explicit Discord action, and unambiguous progress/success/error states.

### Transcript

Current problems: messages float as repeated cards and the ticket context is separated from the reading task.

Plan: document-like transcript column, sticky ticket facts/tool rail, restrained message separators, and strong search/archive states.

### Staff permissions

Current problems: the matrix is visually noisy and status chrome competes with comparison.

Plan: make the matrix the focal point with sticky axes, compact checks, quiet source filtering, and a separate audit log.

### Dev review

Current problems: two large glass cards do not establish list/detail ownership, and code evidence is hard to scan.

Plan: a true split pane with a dense submission inbox, sticky decision header, mono evidence blocks, explicit risk labels, and a fixed decision action region.

## Landing isolation proof

The landing markup and assets are frozen. Automated release QA captures it at 1440, 1024, and 390 px before and after the redesign and compares the PNG pixels. Any difference blocks release.
