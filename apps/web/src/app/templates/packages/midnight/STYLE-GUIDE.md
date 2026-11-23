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

The package currently contains `manifest.ts`, `theme-tokens.ts`, `styles.css`, layout component, pages/components and assets. Its current token object defines six tokens; the package stylesheet applies them to the Midnight host and styles selected dashboard content surfaces.

This guide documents the existing palette and defines the intended complete semantic contract. Where a semantic role is not yet represented by a dedicated runtime token, treat it as a documented implementation gap: add it centrally to the Midnight token contract before using it in feature CSS. Do not fill the gap with an arbitrary local color.

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

These are the values currently present in `theme-tokens.ts`; do not silently change them in a feature PR.

| Token | Value | Intended role |
|---|---|---|
| `--bg` | `#080a12` | Main dashboard background |
| `--panel` | `#10131e` | Default panel/surface base |
| `--muted` | `#8991a4` | Muted text and secondary metadata |
| `--border` | `#303447` | Default subtle border |
| `--purple` | `#8c72ff` | Primary accent, focus and primary action |
| `--cyan` | `#69e5d4` | Secondary accent and selective highlights |

The dashboard package stylesheet currently also declares content surface colors for selected legacy selectors (`.panel`, `.dash-stat`, `.quick-action`, `.bee-dashboard-card`): `#101827` background, `#25324a` border and `#e5ecf8` foreground. These are current implementation values, not permission for feature components to copy them. Consolidate them behind semantic tokens as the shared theme contract evolves.

### 4.2 Semantic token contract

New feature code MUST consume semantic variables rather than literal colors. The following names are the intended semantic contract. If a variable is not yet supplied by the runtime, add it to the central Midnight theme-token implementation and document it there before consuming it.

| Semantic role | Intended variable |
|---|---|
| Main page background | `--bg` |
| Default surface | `--panel` |
| Raised/alternate surface | `--bee-surface-raised` |
| Subtle surface | `--bee-surface-subtle` |
| Primary text | `--bee-text` |
| Secondary text | `--muted` |
| Disabled text | `--bee-text-disabled` |
| Default border | `--border` |
| Strong border | `--bee-border-strong` |
| Primary accent | `--purple` |
| Secondary accent | `--cyan` |
| Focus ring | `--bee-focus-ring` |
| Success | `--bee-status-success` |
| Warning | `--bee-status-warning` |
| Danger | `--bee-status-danger` |
| Informational | `--bee-status-info` |
| Overlay | `--bee-overlay` |
| Control background | `--bee-control-bg` |
| Control border | `--bee-control-border` |
| Control placeholder | `--bee-control-placeholder` |

The semantic names above are a contract to implement centrally, not a claim that every property currently exists. Do not use a CSS fallback such as `var(--bee-surface-raised, #121827)` in a feature component; missing tokens must be fixed at the theme layer.

### 4.3 Accent usage

- Violet is reserved for primary actions, selected navigation, focus and a small number of key highlights.
- Cyan is secondary; use it sparingly for complementary information or data visualization.
- Status colors communicate status only. They must not be repurposed as decorative accents.
- Never make all icons, borders and headings accent-colored.
- Maintain sufficient contrast for text and controls; test actual rendered combinations.

## 5. Surfaces, borders and elevation

### 5.1 Background hierarchy

Use a consistent hierarchy:
1. Main canvas: deepest background (`--bg`).
2. Standard work surface: `--panel`.
3. Raised/interactive surface: semantic raised-surface token.
4. Hover/selected surface: semantic state token, subtle and consistent.

Do not create a new surface shade for every page. The hierarchy must remain recognizable across Company, Users, Roles & Permissions, Settings and future modules.

### 5.2 Cards and panels

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

Exact type scale should be consolidated into shared typography tokens rather than invented per feature. If no shared token exists for a needed level, document and add it centrally.

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

- The package stylesheet owns Midnight shell-level and theme-specific styles.
- The central theme-token file owns palette/token values.
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

## 19. Known gaps to close in implementation

This guide intentionally distinguishes current code from the desired stable contract. The following should be consolidated centrally as the design-system implementation progresses:
1. Expand the six existing Midnight tokens into semantic surface, text, border, control, overlay, focus and status tokens.
2. Replace literal colors in Midnight package surface selectors with semantic tokens.
3. Establish shared typography, spacing, radius, elevation and motion tokens.
4. Build or consolidate shared PageLayout/PageHeader/PageSection and common controls where equivalent implementations currently live in feature components.
5. Audit existing dashboard pages for local hard-coded colors, inconsistent cards/forms/tables and broad CSS selectors.
6. Add automated or documented visual regression checks for Midnight at mobile/tablet/desktop breakpoints.

Do not mark these gaps complete merely because this guide documents them. Update this document when the implementation contract changes.

### Light appearance refinements for shared workspace pages

- Shared components MUST adapt to the active appearance mode through semantic tokens; the Midnight package must not force its dark surface palette into light mode.
- Modal overlays should remain neutral dark translucent layers in both modes; dialogs and menus use the active panel/background tokens, while dialog shadows remain neutral dark.
- Validate the collection toolbar, active/inactive view control, cards, table row hover, overflow menus, forms, empty states and modal details in both light and dark appearance. Violet/cyan accents are preserved as functional states, not decorative gradients or glow.
