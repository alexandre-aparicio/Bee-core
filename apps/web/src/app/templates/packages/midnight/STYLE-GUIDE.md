# Midnight Template — Visual Style Guide

> **Status:** Normative template-specific visual standard  
> **Template ID:** `midnight`  
> **Target:** Dashboard  
> **Current package:** `apps/web/src/app/templates/packages/midnight/`  
> **Required companion:** [Bee-Core Global UI & Page System](../../../../../../../docs/design-system/bee-core-design-system.md)

## 1. Purpose and authority

This document defines the visual identity of the Midnight dashboard. It is mandatory for every new or modified dashboard page, feature, shared component rendering in Midnight, widget, form, table, dialog and interaction.

The global Bee-Core guide defines structure and component behavior. This guide defines their Midnight appearance. If a feature needs a new visual treatment, first determine whether an existing semantic token or component variant already covers it. Do not invent local colors or surfaces.

Midnight is a dark, focused, high-contrast workspace. Its visual language is restrained, precise and professional: deep blue-black foundations, cool neutral text, subtle blue-gray borders and controlled violet/cyan accents. It is not a neon interface; accents are for hierarchy and state, not decoration.

## 2. Current package facts

The package is registered as:
- ID: `midnight`
- Version: `1.0.0`
- Target: `dashboard`
- Layout component: `BeeMidnightLayoutComponent`
- Layout key: `dashboard.midnight`
- Slots: sidebar, topbar, content and widgets.

The package currently contains `manifest.ts`, `tokens.css`, `styles.css`, layout component, pages/components and assets. Its semantic `tokens.css` defines the package palette for Light and Dark and scopes it to the Midnight host and the matching active html surface.

The 89-token contract is complete and authoritative in `templates/base/tokens.contract.css`. Midnight supplies all 89 values in both mode blocks. A genuinely new role must be added centrally and to all six packages in both modes before use.

## 3. Brand and visual character

### 3.1 Personality

- Dark by default, calm and focused.
- High legibility without pure-white glare.
- Cool, slightly blue undertones rather than neutral charcoal-only surfaces.
- Violet is the primary action/focus accent.
- Cyan is a secondary accent for selected highlights and supporting data visualization.
- Borders are subtle but visible enough to define boundaries.
- Shadows are restrained and used for elevation, not as decoration.
- Information hierarchy comes primarily from typography, spacing and surface contrast.

### 3.2 Do not use

- Pure white page backgrounds or large white cards.
- Pure black text or low-contrast gray text.
- Random saturated colors for buttons, icons, charts or badges.
- Multiple gradients competing for attention.
- Heavy glow around ordinary cards and controls.
- Glass blur/transparency effects from another template.
- Bright colored borders on every component.
- Different radii, shadows or input styles on each page.
- Hard-coded local hex values that bypass the theme tokens.

## 4. Midnight color tokens

### 4.1 Existing canonical values

The canonical Midnight Dark palette is defined in the Dark block of `tokens.css`; preserve its semantic mapping when changing dashboard surfaces.

| Token | Value | Intended role |
|---|---|---|
| `--bee-bg` | `#080a12` | Main dashboard background |
| `--bee-surface` | `#10131e` | Default panel/surface base |
| `--bee-text-muted` | `#8991a4` | Muted text and secondary metadata |
| `--bee-border` | `#303447` | Default subtle border |
| `--bee-accent` | `#8c72ff` | Primary accent, focus and primary action |
| `--bee-secondary` | `#69e5d4` | Secondary accent and selective highlights |

The shared dashboard shell in `templates/base/base.css` now owns the `.panel`, `.dash-stat`, `.quick-action` and `.bee-dashboard-card` surface rules. Their backgrounds, borders, foregrounds, shadows and Glass blur resolve through the active package's semantic tokens; package stylesheets no longer define these wrapper surfaces.

### 4.2 Semantic token contract

New feature code MUST consume semantic variables rather than literal colors. The following names are examples from the implemented contract. The complete 89-token reference is in `docs/template-authoring.md` and `templates/base/tokens.contract.css`.

| Semantic role | Intended variable |
|---|---|
| Main page background | `--bee-bg` |
| Default surface | `--bee-surface` |
| Raised/alternate surface | `--bee-surface-raised` |
| Subtle surface | `--bee-surface-subtle` |
| Primary text | `--bee-text` |
| Secondary text | `--bee-text-muted` |
| Disabled text | `--bee-text-disabled` |
| Default border | `--bee-border` |
| Strong border | `--bee-border-strong` |
| Primary accent | `--bee-accent` |
| Secondary accent | `--bee-secondary` |
| Focus ring | `--bee-focus-ring` |
| Success | `--bee-status-success` |
| Warning | `--bee-status-warning` |
| Danger | `--bee-status-danger` |
| Informational | `--bee-status-info` |
| Overlay | `--bee-overlay` |
| Control background | `--bee-input-bg` |
| Control border | `--bee-input-border` |
| Control placeholder | `--bee-input-placeholder` |

The semantic names above are supplied by the central contract and package mode blocks. Do not use a CSS fallback such as `var(--bee-surface-raised, #121827)` in a feature component; if a token is missing, fix the contract and all six package modes.

### 4.3 Accent usage

- Violet is reserved for primary actions, selected navigation, focus and a small number of key highlights.
- Cyan is secondary; use it sparingly for complementary information or data visualization.
- Status colors communicate status only. They must not be repurposed as decorative accents.
- Never make all icons, borders and headings accent-colored.
- Maintain sufficient contrast for text and controls; test actual rendered combinations.

## 5. Surfaces, borders and elevation

### 5.1 Background hierarchy

Use a consistent hierarchy:
1. Main canvas: deepest background (`--bee-bg`).
2. Standard work surface: `--bee-surface`.
3. Raised/interactive surface: semantic raised-surface token.
4. Hover/selected surface: semantic state token, subtle and consistent.

Do not create a new surface shade for every page. The hierarchy must remain recognizable across Company, Users, Roles & Permissions, Settings and future modules.

### 5.2 Cards and panels

#### Unified card and table hover

- Use the same restrained Midnight hover tint for interactive record cards and their equivalent table rows. Documents is the visual reference for this behavior.
- The hover effect is a slight surface-color shift toward the existing violet accent, blended with the current surface; it must remain subtle and preserve readable foreground and border contrast.
- Cards and table rows MUST resolve to the same semantic hover-surface token/treatment. Do not create separate per-component accent colors, stronger row highlights, gradients, glows or scale effects.
- Keep the transition short and limited to surface/background and, where needed, a subtle border-color adjustment. Do not move content or alter dimensions.
- In Light appearance, blend the same accent gently into the light surface; do not reuse a dark-mode literal or reduce text contrast. In Dark appearance, blend it into the active Midnight panel surface.
- Hover is supplementary pointer feedback. Preserve an equally clear `:focus-visible` state, and never hide essential actions behind hover (especially on touch devices).

- Use a subtle cool border to define cards against the dark canvas.
- Keep the same border thickness and corner-radius family across equivalent components.
- Use a restrained surface difference; cards should not look like bright floating tiles.
- Use padding consistently and align card headers/body/footer.
- Avoid excessive shadows; reserve elevation for overlays or genuinely raised surfaces.
- Do not put every field into a separate card.
- Nested panels should be rare and visually subordinate.

### 5.3 Dividers

- Use thin, low-contrast separators.
- Prefer spacing over repeated dividers.
- Do not use bright accent lines as generic separators.
- Table separators and section separators should share a coherent treatment.

## 6. Typography

The Midnight dashboard must prioritize legibility and hierarchy.
- Primary headings use the application's established dashboard font stack; do not independently load or introduce a font in a feature.
- Page title is the dominant heading; section headings are clearly subordinate.
- Body text uses the primary foreground token; supporting descriptions use muted text.
- Labels remain legible and should not be reduced to tiny uppercase metadata.
- Uppercase/letter-spaced eyebrow labels are optional and reserved for short context labels, not ordinary field labels.
- Use consistent weights: regular for body, medium/semibold for labels and controls, bold for key values/headings.
- Avoid excessive negative letter spacing, all-caps paragraphs and long lines.
- Numeric values in KPI/data contexts should align consistently and remain readable.

Use existing dashboard typography tokens where applicable. Do not invent per-feature scales; add a genuinely missing semantic role centrally and to all packages only after review.

## 7. Page layout in Midnight

The Midnight shell owns the dashboard frame, sidebar, topbar and content host. Feature pages own only their content inside the host.
- Never draw another full-screen dashboard background inside a page.
- Use the global page anatomy: header, description, optional actions, toolbar, sections and page states.
- Content should sit on the dashboard canvas with consistent horizontal and vertical rhythm.
- Do not set page-specific max-widths or offsets without a documented content reason.
- Keep page header and first section aligned.
- Do not let a page's local CSS override shell navigation, topbar or global content spacing.
- Keep page content width fluid; constrain reading-heavy or form-heavy regions only when needed.

## 8. Buttons and actions

### 8.1 Collection view controls

When a collection supports both card and table presentation, use the same compact two-button switcher already established in Bee-Core:
- Place it in the toolbar immediately to the left of the primary contextual action (such as Upload or Create).
- Use the same card/table glyphs, equal compact hit areas, subtle border and restrained Midnight surface.
- The selected view uses the violet accent; the inactive view remains readable in muted foreground.
- Provide accessible names, tooltips and `aria-pressed` state for each button.
- Keep the switcher adjacent to the primary action at desktop widths; allow a clean wrap on mobile.
- Switching views changes presentation only; records, permissions and actions remain identical.

### 8.2 Vertical ellipsis for overflow menus

- Use the vertical three-dot icon (`⋮` / established vertical-ellipsis icon) for contextual overflow menus in both cards and tables.
- Do not replace it with a “More” text button or an unrelated menu symbol.
- Match the established icon-button hit area, hover/focus treatment and accessible name/tooltip.
- Keep the same icon and action placement for the same entity across card and table views.

### Primary
- Violet accent background with high-contrast foreground.
- Clear label, consistent height, radius and horizontal padding.
- Use sparingly: one dominant primary action per context.
- Hover/active states should adjust brightness/surface subtly, not introduce an unrelated color.

### Secondary
- Dark or transparent surface with a subtle border and readable foreground.
- Must remain visually distinct from plain text and disabled controls.

### Quiet/tertiary
- Minimal surface; use for low-priority actions.
- Hover should provide a clear but restrained surface change.

### Destructive
- Use the semantic danger role, not violet/cyan.
- Confirmation is required for irreversible or high-impact actions.
- Do not use red for ordinary cancel/back actions.

### Icon buttons
- Use consistent icon size and hit area.
- Visible hover/focus states.
- Accessible name and tooltip are mandatory.

All variants must support hover, focus-visible, active, disabled and loading states.

## 9. Forms and controls

- Inputs/selects/textareas use a dark control surface distinct enough from the surrounding panel.
- Borders are subtle at rest and clearly visible on focus.
- Focus uses the violet accent with a visible ring; do not rely on border color alone.
- Text is high contrast; placeholders use muted/placeholder semantics and remain readable.
- Disabled controls must be visibly disabled without becoming illegible.
- Read-only values should remain readable and distinguishable from editable controls.
- Error borders/messages use semantic danger; success feedback uses semantic success.
- Labels, help text and errors follow the global form contract.
- Control heights, radius, padding and font size must match across all features.
- Do not create custom one-off input designs inside feature components.

## 10. Tables, lists and data presentation

- Table rows that represent the same records as cards MUST reuse the card hover tint defined above. The hover difference should be perceptible but understated in both Light and Dark modes; selected, focused, dragged and drop-target states remain distinct and take precedence.

- Table header text is subdued but readable; never low-contrast to the point of disappearing.
- Row surfaces remain consistent with the containing panel.
- Hover/selected rows use a subtle cool surface shift.
- Dividers are restrained and consistent.
- Primary cell text uses the main foreground; secondary metadata uses muted text.
- Numeric columns align consistently.
- Status badges use the shared semantic status palette.
- Overflow menus and row actions use the same icon-button contract.
- Empty/loading/error states use shared patterns.
- Charts must use a restrained palette; violet is primary series, cyan secondary, and status colors only when data semantics require them. Do not use a rainbow palette.

## 11. Tabs, navigation and selected states

- Selected tabs/navigation use violet as a restrained cue (text, indicator or subtle surface), not multiple competing effects.
- Inactive items remain readable; muted must not mean disabled.
- Hover and keyboard focus must be distinguishable from selected state.
- Do not confuse active, hover and focus styles.
- Navigation inherited from the template shell must not be recreated inside feature pages.
- Use consistent icon/text spacing and active indicator geometry.

## 12. Badges and status semantics

- Neutral: ordinary category or non-critical state.
- Success: completed, active/healthy or verified state.
- Warning: attention required or approaching limit.
- Danger: failed, suspended, revoked or destructive state.
- Info: informative state that is neither positive nor negative.

Use text labels, not color alone. Keep badge shapes and dimensions consistent. Avoid bright filled pills for every metadata item; reserve strong fills for important status.

## 13. Dialogs, menus, popovers and overlays

- Dialog surface must be clearly elevated from the dashboard while retaining the Midnight palette.
- Overlay dims the background without obscuring context completely.
- Dialog title, body and footer follow shared spacing and alignment.
- Primary/destructive actions retain their semantic variants.
- Menus use a raised surface, subtle border and clear hover/focus rows.
- Avoid clipping overlays inside scrollable page containers.
- Focus management and keyboard behavior follow the global guide.
- Do not introduce blur-heavy glass treatment; that belongs to another visual identity.

### Canonical modal skin (required for every feature)

The global Bee-Core Design System defines the modal structure and interaction contract. Midnight supplies only the visual skin; it MUST NOT create a different modal layout for individual features.

- **Backdrop:** use `--bee-overlay` in both Dark and Light appearance, fixed to the full viewport with `inset: 0`, above the dashboard header/topbar, and apply the shared 8px blur to the complete background. Keep backdrop and panel as separate layers.
- **Panel:** use the semantic Midnight surface, text, border and shadow tokens. Match the shared reference geometry (760px max width, 84vh/820px max height, 20px padding, 16px radius, 16px internal gap, 24px desktop backdrop inset and 12px narrow-screen inset). Do not hard-code a dark surface in Light mode.
- **Header:** keep the same centered alignment, eyebrow/title/description hierarchy and close icon-button placement in every feature. The canonical title is compact (15px); close control is 34px. Do not change typography or spacing between Teams, Documents or future dialogs.
- **Footer:** keep one right-aligned action row, vertically centered, with a 9px gap, top divider and consistent top padding. Cancel/secondary comes before the primary action; destructive confirmation uses the danger variant in the primary position. Reuse the global button variants and dimensions.
- **Scroll and responsive behavior:** backdrop stays fixed; long dialog content scrolls inside the panel. The panel must fit narrow viewports without clipping controls or footer actions.
- **States:** hover, focus-visible, active, disabled, loading, destructive and validation states use the same semantic tokens and shared control behavior. Do not invent feature-specific colors, shadows, glow or animation.
- **Light and Dark:** verify the overlay, panel, title, muted description, borders, close control, body controls, footer buttons and focus ring in both modes. Light uses a light semantic panel and dark readable foreground; Dark uses the deep Midnight surface.
- **Accessibility:** preserve dialog/alertdialog semantics, `aria-modal`, labelled title/description, focus containment/restoration, safe Escape behavior and reduced-motion preferences.

Organization → Teams and Documents are the canonical cross-feature comparison pair. When changing either dialog, compare both implementations side by side; changes to the shared contract must be applied to both and documented here and in the global guide.

## 14. Icons, imagery and charts

- Use the established icon library and consistent stroke/size.
- Icons default to foreground/muted roles; violet/cyan are reserved for emphasis.
- Avoid colored icon tiles on every row or card.
- Product/user avatars and illustrations must use consistent sizes and fallback treatment.
- Images inside dark surfaces should have a subtle boundary only when needed.
- Data visualizations should use restrained contrast, clear legends and accessible labels; never encode categories by color alone.

## 15. Motion and interaction

- Motion is subtle and purposeful: hover, focus, open/close, loading and state transitions.
- Avoid large spring/bounce effects, pulsing decoration and constant animated glows.
- Respect `prefers-reduced-motion`.
- Transitions should not delay interaction or obscure state changes.
- Hover states must not be the only way to reveal essential controls; mobile has no hover.
- Focus-visible must be as clear as pointer hover.

## 16. Responsive Midnight behavior

- Preserve the dark visual hierarchy at all viewport widths.
- On mobile, forms stack, action groups wrap and cards become one column as needed.
- Do not shrink text to fit; allow wrapping.
- Table scrolling must be contained within the table region, not the entire dashboard.
- Menus/dialogs must fit within the viewport and remain keyboard/touch accessible.
- Ensure selected tabs and sidebar states remain understandable when navigation collapses.
- Test 320–375px mobile, 768px tablet and 1280px+ desktop.

## 17. CSS ownership and implementation rules

- The shared `base.css` owns dashboard shell structure and responsive behavior. The Midnight package stylesheet is reserved for Midnight-specific decoration that cannot be expressed through semantic tokens.
- The central `tokens.contract.css` defines the semantic contract; Midnight `tokens.css` supplies its Light and Dark values.
- Shared UI components own reusable component structure and base behavior.
- Feature components own only unique content layout and must consume semantic tokens.
- Scope Midnight-specific styles under `.bee-template-package-host--midnight` or the established host scope.
- Do not leak Midnight selectors into global styles.
- Do not copy palette hex values into component styles.
- Do not style broad elements such as all `button`, `input`, `section` or `header` from a feature component.
- Do not override template styles with `!important` as a shortcut.
- Do not add local fallback colors for missing variables.
- If a needed token or shared variant is missing, add it centrally with a clear semantic name and update this guide.

### 17.1 Legacy styles

Existing components may contain local CSS and legacy selectors. New work MUST NOT copy those local patterns as precedent when they conflict with this guide. During refactoring:
1. Preserve behavior and responsive support.
2. Replace local visual values with semantic tokens.
3. Consolidate repeated patterns into shared components.
4. Remove obsolete selectors only after verifying no consumers remain.

## 18. Visual quality checklist

Before a Midnight page is considered complete, verify:
- [ ] Main background and surfaces match the Midnight hierarchy.
- [ ] No white/light card or black text has leaked into the page.
- [ ] Text and metadata have sufficient contrast.
- [ ] Violet is used for primary emphasis, not everywhere.
- [ ] Cyan is used sparingly.
- [ ] Cards, panels, borders and radii are consistent.
- [ ] Inputs, selects and textareas share the same control language.
- [ ] Buttons have consistent hierarchy and states.
- [ ] Tables, tabs, badges and menus match shared patterns.
- [ ] Focus-visible, hover, active, disabled and loading states are coherent.
- [ ] No arbitrary palette hex values or unregistered theme variables are used.
- [ ] Responsive behavior is checked at mobile, tablet and desktop.
- [ ] Empty, loading, error, success and read-only states match the rest of the application.
- [ ] No shell/navigation styles are duplicated by the feature.
- [ ] Global Bee-Core Design System guide is followed.

## 19. Validation boundary

The source-level contract is implemented: all 89 tokens exist in both Midnight modes, the strict style guard is active, the WCAG checker is blocking, and the template browser matrix exercises both modes. CI also captures full-page screenshots of the key dashboard screens.

The automated screenshot suite does not compare pixels with the pre-refactor baseline. Human visual equivalence for Midnight Dark/Light, Paper and Glass remains NOT verified. First paint before Angular boots also remains NOT verified.

### Light appearance refinements for shared workspace pages

- Shared components MUST adapt to the active appearance mode through semantic tokens; the Midnight package must not force its dark surface palette into light mode.
- Modal overlays should remain neutral dark translucent layers in both modes; dialogs and menus use the active panel/background tokens, while dialog shadows remain neutral dark.
- Validate the collection toolbar, active/inactive view control, cards, table row hover, overflow menus, forms, empty states and modal details in both light and dark appearance. The active package accent tokens are preserved as functional states, not decorative gradients or glow.


### Documents active dashboard token contract

Documents consumes the active dashboard package tokens in both modes. Cards, card hover, menus, dialogs, tabs, suggestions, chips, hint panels, empty states and tables must use semantic tokens. Component-local Midnight-Light palette overrides are not permitted.

The template runtime owns the active HTML mode attributes. Browser tests capture Documents under Midnight, Paper and Glass in Light and Dark, but those screenshots are not pixel assertions against a pre-refactor baseline.

## 20. Toast notifications and full-viewport modal overlays

### Toast notifications

- Use the active Midnight surface and foreground tokens; toast surfaces match raised workspace panels rather than introducing a new color treatment.
- Place routine success toasts at the bottom-right of the viewport. On mobile, keep consistent safe insets and use the available width.
- Use a subtle border, restrained Midnight shadow and a narrow success-status edge/icon. The message remains readable without relying on color.
- Include an accessible dismiss control; announce success with `role="status"` and `aria-live="polite"`.
- Routine success toasts dismiss after approximately 3–5 seconds, can be dismissed immediately and never steal focus.
- Errors that require correction remain next to the relevant form/control and use alert semantics rather than being disguised as success toasts.
- Respect reduced-motion settings.

### Modal backdrop and viewport coverage

- A modal backdrop MUST cover the complete viewport (`inset: 0`) and sit above the dashboard shell/header as well as page content. Use a stacking level that is not obscured by the topbar.
- Apply the same neutral-dark translucent overlay in Dark and Light appearance and blur the entire background behind it, including the dashboard header/topbar.
- The dialog itself uses the active Midnight panel/surface, foreground, border and shadow tokens. Light appearance must use a light dialog surface with dark readable text; Dark appearance retains the deep Midnight surface.
- Keep the backdrop separate from the dialog scroll container so blur/dimming remain fixed while long dialog content scrolls.

The shared `--bee-overlay` token is defined in the Midnight `tokens.css` mode blocks and remains neutral-dark in both appearance modes.

## Collection hover behavior

Use the Documents collection hover as the canonical Midnight reference for cards and tables:

- Cards receive a subtle violet surface shift by blending 92% of the current panel surface with 8% `--bee-accent` and a border blended 48% toward `--bee-accent`.
- Table rows receive a restrained 5% `--bee-accent` tint over transparency.
- Keep the transition to background and border colors only (approximately 160ms). Do not add glow, scale, elevation, opacity changes or movement to ordinary collection hover.
- Apply semantic tokens rather than fixed colors. The same rules must remain legible in Midnight Light and Dark; the active surface and accent tokens supply the mode-specific values.
- Keep hover separate from selected, focus-visible, drag-over and disabled states. Keyboard focus continues to use the documented focus outline.

### System-role catalog card pattern

In Midnight, the System Roles catalog uses the same card geometry and subtle hover treatment as Organization → Teams. Keep the role cards equal-height within each grid row, use the established semantic border/surface/accent tokens, and keep permission previews compact: three overlapping neutral badges plus a calculated remainder count. Active/Inactive must always include text, not color alone. The vertical-ellipsis menu and role-details modal must match the shared Teams/Documents interaction and modal contracts in both Light and Dark themes.

### System Roles collection controls and permission markers

The System Roles tab MUST use the same collection composition as Organization → Teams: a Cards/Table segmented view control in the collection header, the primary Create role action at the far edge, and a search field below the header. Cards and table rows MUST share the same content, filtering and restrained hover behavior. Permission previews use compact circular initials (for example, View members → VM, View plugins → VP, View files → VF); each circle exposes the complete permission label through a hover/focus tooltip and accessible name. Keep the marker surface, border, accent and tooltip semantic-token based in Light and Dark. The Create role action opens the existing Custom Roles creation flow; built-in Core roles remain immutable.


### System Roles permission-circle overlap and view-toggle alignment

- Stack the permission circles with a consistent negative inline-start margin and a 2px separator matching the active collection surface. Preserve the order and tooltip/focus behavior; place `+N` after the stack with visible spacing.
- The Roles Cards/Table buttons must match Teams exactly: 34×32px, zero padding, 17px glyph, 7px radius, centered with `display:grid; place-items:center` and `line-height:1`. Reset inherited button padding locally so the glyph cannot drift off-center.


### Organization Roles — Midnight Light parity
- Organization → Roles & Permissions and Organization → Teams consume the canonical Midnight package tokens directly; neither component carries a local Midnight-Light `:host-context` palette override. Light and Dark differences come only from the package's active mode token blocks, so Glass and Paper remain isolated.
- System-role cards, tabs, search, table, overflow menus, permission circles/tooltips and role dialogs must use the mapped semantic tokens. Selected Cards/Table controls and primary actions keep a white foreground over violet for contrast, matching Teams.
- Any new Roles surface or control must be checked in both Midnight Light and Midnight Dark; a light dashboard canvas alone does not count as Light-mode support.


### Organization → Users collection (Midnight)

- Match Documents' collection toolbar: two equal 50% zones, with search/status filters on the left and the Cards/Table selector right-aligned in the right zone with a small right inset. Stack the zones cleanly on mobile.
- Reuse Documents' view selector exactly: 34×32px buttons, 5px gap, 7px radius, 17px centered glyph, zero padding, semantic border and active package accent selected state. Keep keyboard focus and aria-pressed behavior.
- Users cards use three columns on desktop, two on tablet and one on mobile; equal-height cards per row, 12px gap, 12px radius, 16px padding and the Documents restrained violet hover tint. Table rows use the matching 5% active-package accent hover tint.
- Cards and Table show the same filtered members and preserve all existing role assignment, restriction, status and overflow actions. Use Midnight semantic tokens so panels, controls, borders, text and selected states remain correct in Light and Dark.


## Semantic token ownership (current architecture)

The package palette source is `tokens.css`, scoped to the package host and mirrored onto the active html surface:

- Dashboard selectors use `data-bee-template="<id>"` and `data-bee-dashboard-mode="light|dark"`.
- Public selectors use `data-bee-template="<id>"` and `data-bee-public-mode="light|dark"`.
- Every package must define the full `--bee-*` contract in both modes, including surfaces, text, borders, accent, statuses, effects, shape and inputs.
- Midnight is a normal package, not the global base. Its dark token values are the source for the established Midnight dark palette; its light palette is independently defined.
- Package `styles.css` is reserved for decoration/layout that cannot be expressed through tokens. Do not add palette declarations there or add `!important` overrides.
- The base contract owns neutral fallback values only. Core appearance code owns mode controls and lifecycle, never a package palette.

The six legacy aliases (`--bg`, `--panel`, `--muted`, `--border`, `--purple`, `--cyan`) are absent and must not be reintroduced. Feature consumers use semantic `--bee-*` tokens. The client custom-palette adapter is removed; the server's legacy `/templates/theme` API remains unchanged for compatibility.
