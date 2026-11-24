# Bee-Core Design System — Global UI & Page System

> **Status:** Normative design and implementation standard  
> **Scope:** Every first-party Bee-Core dashboard page and shared frontend component  
> **Applies to:** Page System (Layer 1) and Shared UI Components (Layer 2)  
> **Theme relationship:** This document defines structure, semantics, interaction and reusable component contracts. The active dashboard template defines the visual skin. For the current target, also read [Midnight Style Guide](../../apps/web/src/app/templates/packages/midnight/STYLE-GUIDE.md).

## 1. Purpose and authority

Bee-Core must feel like one coherent application, not a collection of independently styled screens. Every new page, feature, dialog, form, table, widget or refactor MUST follow this guide and the active template's style guide.

This guide is normative:
- **MUST / MUST NOT** indicate mandatory rules.
- **SHOULD / SHOULD NOT** indicate the default; deviations require a documented reason.
- **MAY** indicates an allowed option.

When an existing implementation conflicts with this guide, do not silently create another convention. Prefer the shared pattern, or document the legacy exception and migrate it deliberately. Do not break working functionality merely to rename classes.

### 1.1 Three-layer model

1. **Page System:** page composition, layout, hierarchy, spacing, responsive behavior and common page states.
2. **Shared UI:** reusable controls and patterns (cards, buttons, forms, tables, tabs, dialogs, feedback).
3. **Template skin:** theme tokens and visual expression (Midnight today).

Layers 1 and 2 MUST NOT hard-code a template's colors, shadows, background treatments or other theme-specific visual decisions. Layer 3 MUST NOT redefine business behavior, permissions, routing, data loading or page structure.

## 2. Repository reality and implementation boundary

The current frontend is Angular and uses trusted dashboard template packages under `apps/web/src/app/templates/packages`. The template registry currently includes Midnight and Paper as built-in dashboard templates and Glass as a package. Midnight is the default dashboard selection in the template engine.

The Midnight package currently exposes a small fixed token set:
- `--bg`: `#080a12`
- `--panel`: `#10131e`
- `--muted`: `#8991a4`
- `--border`: `#303447`
- `--purple`: `#8c72ff`
- `--cyan`: `#69e5d4`

The current package CSS also styles dashboard content surfaces such as `.panel`, `.dash-stat`, `.quick-action` and `.bee-dashboard-card`. Some feature components still carry local component styles and use legacy classes/tokens. Therefore this guide establishes the canonical target and migration rules; it does **not** claim that every primitive described below already exists as a shared Angular component or that every current page already conforms.

Relevant implementation locations:
- Template registry and engine: `apps/web/src/app/templates/`
- Template package: `apps/web/src/app/templates/packages/<template-id>/`
- Midnight package: `apps/web/src/app/templates/packages/midnight/`
- Global frontend stylesheet: `apps/web/src/styles.css`
- Existing page examples include Organization Company, Users and Roles & Permissions components.

Before implementing a primitive, search for an existing shared component, directive, utility or established pattern. Extend/reuse it where appropriate; do not create a parallel component just because its name differs.

## 3. Global experience principles

Every screen MUST satisfy these principles:

1. **Consistency:** equivalent tasks use equivalent layouts, labels, controls, spacing and feedback.
2. **Clarity:** users can identify where they are, what the page does, what action is primary and what state the system is in.
3. **Hierarchy:** one clear page title, grouped content, restrained emphasis and predictable reading order.
4. **Density with breathing room:** information-rich admin screens remain scannable; avoid both excessive whitespace and cramped controls.
5. **Predictability:** actions appear in consistent locations and behave consistently.
6. **Accessibility:** keyboard, focus, contrast, labels and assistive-technology semantics are first-class.
7. **Responsive integrity:** no page may require horizontal scrolling at normal mobile widths except a deliberately scrollable data region.
8. **Tenant and permission awareness:** visual affordances must reflect actual authorization, but hiding a button is never a security control.
9. **Localization:** layouts must tolerate translated labels, longer text, RTL-ready logical layout properties where practical, and locale-specific data.
10. **Progressive disclosure:** advanced or destructive options should not overwhelm the primary workflow.

## 4. Layer 1 — Page System

### 4.1 Canonical page anatomy

A standard dashboard page SHOULD follow this order:

```text
PageLayout
├── PageHeader
│   ├── Breadcrumbs (when useful)
│   ├── Eyebrow / scope (optional)
│   ├── Title
│   ├── Description
│   └── Primary and secondary actions
├── PageToolbar (optional: search, filters, view controls)
├── PageFeedback (loading/error/success where appropriate)
└── PageContent
    ├── PageSection
    │   ├── SectionHeader
    │   └── SectionContent
    └── ...
```

A page MAY omit optional parts when they add no value. It MUST NOT add decorative headers, duplicate titles or empty wrappers merely to satisfy a template.

### 4.2 PageLayout

Responsibilities:
- Own the page's content boundary and vertical rhythm.
- Provide a consistent minimum-width-safe, responsive content area.
- Avoid duplicating the dashboard shell, sidebar or topbar owned by the active template.
- Keep content in normal document flow; avoid fixed positioning for ordinary page content.
- Use CSS logical properties (`margin-inline`, `padding-inline`, `inset-inline`) where practical.

Rules:
- A page component MUST render its content inside the host-provided dashboard content region.
- Do not add a second viewport-sized shell, duplicate sidebar/topbar, or independent page background.
- Avoid arbitrary per-page max-width values. Use the shared page width contract; a deliberately narrow form/detail view may declare a documented variant.
- Page-level overflow must not clip menus, focus rings or dialogs.

Canonical class contract for new primitives (subject to implementation in the shared UI layer):
- `.bee-page`: root page flow and width.
- `.bee-page__header`: page heading region.
- `.bee-page__content`: main content stack.
- `.bee-page__toolbar`: filters and view actions.
- `.bee-page__section`: semantic content section.
- `.bee-page__actions`: page/section actions.

These names define the target naming convention; they are not a claim that all classes are already implemented globally.

### 4.3 PageHeader

A page header SHOULD contain:
- A single H1 page title.
- A concise description explaining purpose or scope.
- Breadcrumbs only when hierarchy materially helps orientation.
- Optional eyebrow/scope label for context (e.g. organization vs platform).
- Primary action aligned consistently with the title block on wide screens and placed predictably on narrow screens.

Rules:
- Do not use multiple H1 elements for the same page.
- Do not use a section heading as a second page title.
- Titles should describe the object/task, not an implementation detail.
- Avoid long explanatory paragraphs in the header; put instructions near the relevant control.
- Actions MUST have explicit accessible names. Icon-only actions require an accessible label and tooltip/title.
- If the page has no primary action, do not invent one.

### 4.4 PageSection and SectionHeader

- Group related information into meaningful sections.
- Give sections a concise heading; add a short description only when it adds context.
- Use cards/panels only when grouping, separation or hierarchy benefits from a surface. Do not wrap every paragraph or field in its own card.
- Related sections SHOULD use consistent spacing and heading hierarchy.
- Avoid nested cards inside cards unless there is a clear semantic reason.
- Section actions belong in the section header, not scattered randomly in the content.

### 4.5 PageToolbar

Use for search, filters, sorting, view switching, bulk actions and contextual tools.
- Keep frequently used controls visible.
- Group related filters.
- Show active filters and provide a clear reset path.
- On mobile, controls may wrap or move into a filter panel; preserve discoverability.
- Do not place destructive actions next to routine filters without separation.
- Search inputs need a label or accessible name and a clear empty/reset behavior.

### 4.6 Content grids and spacing

- Use CSS Grid/Flexbox for layout; do not use tables for page layout.
- Prefer intrinsic sizing such as `minmax(0, 1fr)` to prevent long content from expanding columns.
- Two-column form layouts are acceptable on wide screens when fields are logically related. Collapse to one column on narrow screens.
- KPI/stat cards should form a responsive grid and must not force fixed widths.
- Use one consistent spacing scale throughout the page. Prefer existing design tokens/utilities; do not introduce one-off gaps for visual nudges.
- Align card edges, section headings and form columns intentionally.
- Do not use absolute positioning to align normal page content.

### 4.7 Responsive behavior

Responsive behavior is content-driven, not device-brand-driven.
- Wide desktop: use available space without stretching text or forms to unreadable widths.
- Tablet: reduce columns and allow action groups to wrap.
- Mobile: stack page heading/actions, collapse multi-column forms, allow tab navigation to scroll or adapt, and keep controls comfortably tappable.
- Tables may use a dedicated horizontal-scroll container or a deliberate compact/card presentation. If scrolling, make the scroll region obvious and preserve access to row actions.
- Never hide essential information or actions solely because the viewport is narrow.
- Test at approximately 320–375px, 768px and 1280px+; these are validation checkpoints, not mandatory CSS breakpoint values.

### 4.8 Page states

Every data-driven page MUST deliberately handle applicable states:

| State | Required behavior |
|---|---|
| Initial loading | Show a stable, non-jumping loading indicator/skeleton; prevent duplicate submissions. |
| Empty | Explain what is empty and why; offer a relevant next action only if the user can perform one. |
| Error | Explain what failed in plain language; offer retry when retry is safe. |
| Success | Confirm completed action briefly and accessibly; avoid disruptive alerts for routine saves. |
| Partial | Distinguish unavailable sections from successfully loaded content. |
| Read-only | Explain or signal that editing is unavailable when that affects the task. |
| Saving | Disable duplicate submission and communicate progress. |

Do not show a permanent spinner, blank panel or raw exception as the only feedback. Do not report success before the server confirms success.

### 4.9 Page composition examples

**Profile/settings page:** PageHeader → one or more semantic PageSections → grouped form fields → contextual validation → footer/action row. Keep save action predictable; do not repeat save buttons in every card without a workflow reason.

**List/management page:** PageHeader → PageToolbar (search/filters/create) → table/list surface → pagination or load-more → empty/error state. Row actions must be consistent and permission-aware.

**Tabbed workspace:** PageHeader → tabs → active tab content. Tabs switch peer views; they are not substitutes for links to separate routes. Preserve keyboard semantics and responsive access.

**Dashboard/overview:** PageHeader (optional) → KPI grid → meaningful content sections. Do not make every data point a separate decorative card.

## 5. Layer 2 — Shared UI Component contracts

The contracts below define expected behavior and appearance responsibilities. Use existing Angular components where available. If no shared implementation exists, document the gap and implement it in the shared UI layer rather than duplicating it inside a feature.

### 5.1 Surfaces: Card, Panel, Container

Use:
- **Card** for a self-contained item or summary.
- **Panel** for a larger grouped work area, form or table.
- **Container** for layout boundaries, not decoration.

Rules:
- A surface has one clear purpose and a consistent internal padding.
- Avoid cards nested inside cards, excessive borders and multiple competing shadows.
- Do not use a surface solely to make a page look busy.
- Header, body and footer regions should align across equivalent cards.
- Surface colors/borders/shadows come from template tokens, never literal per-feature colors.
- Interactive cards must expose keyboard interaction and a visible focus state; otherwise keep them non-interactive.

### 5.2 Buttons and actions

### 5.2.1 Collection view switcher

For collection/list pages where the same records can be meaningfully scanned as cards and as rows, provide both **Cards** and **Table** views unless the data shape makes one presentation unsuitable.

- Place the view switcher in the page toolbar, immediately before the primary contextual action (for example, Upload or Create).
- Keep the switcher and action in one right-aligned toolbar group; allow wrapping on narrow screens without changing their order.
- Use the established compact two-option control pattern: two equal icon buttons inside an unboxed group (the wrapper has no border, background or padding); each button owns its subtle border, restrained surface and clear selected state.
- Use the application's established card/table glyphs consistently; do not replace icons with text labels such as “Cards” and “Table” in the compact control.
- Each icon button MUST have an accessible name and tooltip (for example, “Card view” and “Table view”), and expose its state with `aria-pressed`.
- The default view should be consistent within the same feature and should not reset when records refresh or a folder/location changes.
- Both views MUST expose the same records, available actions, permission rules, loading/error/empty states and data; switching presentation must not change business behavior.
- On narrow screens, the toolbar may wrap. Tables must scroll inside their own region rather than widening the page.

### 5.2.2 Overflow actions and vertical ellipsis

- Contextual overflow actions MUST use the application's vertical three-dot icon (`⋮` / established vertical-ellipsis icon), not a textual “More” label or a different menu glyph.
- Keep the hit area consistent with other icon buttons. Provide a meaningful accessible name and tooltip such as “Folder options” or “Company actions”; hide a decorative glyph from assistive technology.
- Use the same vertical-ellipsis convention in card and table rows for the same entity and actions.
- The menu's contents and authorization remain unchanged when moving between card and table presentations.

Standard action hierarchy:
- **Primary:** the one main action for the current context (Save, Create, Invite).
- **Secondary:** supportive actions (Cancel, Refresh, Export).
- **Tertiary/quiet:** low-emphasis actions that do not compete with primary.
- **Destructive:** delete, revoke, suspend or irreversible action; visually and behaviorally distinct.
- **Icon action:** compact contextual action with accessible name and tooltip.

Rules:
- Use native `button` for actions and anchors for navigation.
- Do not use clickable `div`/ `span` as buttons.
- Do not use multiple primary buttons in one action group unless the workflow truly has multiple equal primary outcomes.
- Buttons need hover, focus-visible, active, disabled and (where applicable) loading states.
- Disable or guard duplicate submissions while an operation is in progress.
- Destructive actions require clear wording; confirmation is required for irreversible or high-impact operations.
- Keep button height, radius, typography, icon spacing and padding consistent through shared variants.
- Avoid emoji as interface icons.

### 5.3 Iconography

- Use the application's existing icon library and established icon set.
- Keep icon family, stroke weight, optical size and alignment consistent.
- Icons supplement labels; they must not make meaning ambiguous.
- Icon-only controls require accessible names.
- Do not mix emoji, arbitrary SVG packs and multiple icon libraries within one workflow.
- Do not use an icon as the sole indicator of status or severity.

### 5.4 Forms and fields

A field consists of a persistent label, control, optional help text and validation feedback.
- Labels MUST be programmatically associated with controls.
- Placeholder text is an example/hint, never a replacement for a label.
- Mark required/optional fields consistently; avoid marking every field required by implication.
- Group related fields and use fieldsets/legends for genuinely related controls.
- Keep field widths appropriate to their data (e.g. short codes need not span the entire page).
- Use consistent control heights, padding, border, radius and typography.
- Focus must be visible; error states must be more than a color change.
- Preserve entered values when validation fails.
- Validation messages should explain how to fix the issue.
- Disabled and read-only are different: use disabled only when interaction is unavailable; use read-only when the value should remain selectable.
- Use appropriate input types, autocomplete, input modes and browser validation semantics.
- Do not place unrelated fields in the same visual group just to fill a grid.

### 5.5 Selects, checkboxes, radios and toggles

- Use the native or established accessible control unless the shared component provides equivalent keyboard and screen-reader behavior.
- A toggle is for an immediate on/off setting, not for choosing among several options.
- Radio groups are for a small mutually exclusive set; selects are for larger sets.
- Checkbox labels must describe the effect of the checked state.
- Do not use a toggle for an action that should require confirmation or a save step without making that behavior clear.
- Show selected, focus, disabled and error states consistently.

### 5.6 Tabs and navigation

- Use tabs only for peer content within the same workspace/context.
- Use links for route navigation.
- Provide keyboard navigation, focus visibility, selected state and correct ARIA semantics.
- Keep tab labels concise and stable; do not use long descriptive sentences.
- On narrow screens, allow horizontal scrolling or an accessible alternate presentation; do not silently truncate labels.
- Do not duplicate navigation in page content when the template shell already provides it.

### 5.7 Tables and data lists

- Use semantic tables for genuinely tabular relationships with column headers.
- Provide clear empty, loading and error states.
- Align numeric values consistently; avoid mixing unrelated data types in a column.
- Keep row height, padding, separators and hover behavior consistent.
- Long values should wrap, truncate with an accessible way to inspect, or occupy a deliberate secondary line.
- Row actions belong in a predictable final column or consistent overflow menu.
- Do not expose internal database IDs or opaque tokens as user-facing identity.
- On mobile, choose a documented scroll or card transformation; preserve all important fields/actions.
- Sorting/filtering/pagination controls must communicate current state.
- Use bulk selection only when bulk operations exist and permissions are checked server-side.

### 5.8 Badges and status indicators

- Use badges for short state/category labels, not as decorative tags.
- Define a shared semantic palette for success, warning, danger, info and neutral in the template layer.
- Pair color with text/icon; never rely on color alone.
- Keep badge shape, typography and padding consistent.
- Avoid using multiple bright badges in one row unless each conveys distinct important information.

### 5.9 Alerts, inline feedback and notifications

- Inline feedback belongs near the affected form or section.
- Reserve global notifications for events that matter beyond the current control.
- Use appropriate semantics (`role=alert`, `aria-live`) without announcing every minor UI change.
- Error copy should be actionable and avoid exposing stack traces, secrets or internal details.
- Success feedback should be concise and should not persist indefinitely without reason.
- Do not use browser `alert()`/ `confirm()` for normal product interactions.

#### Toast notification

Use a toast for a completed action whose confirmation does not need to remain attached to a form or card.

- Position the toast at the lower-right of the viewport, above page content and other transient UI. On narrow screens, use safe horizontal/bottom insets and allow the toast to span the available width.
- Use the active template's raised/panel surface, readable foreground, subtle border, restrained shadow and a narrow semantic status accent. Do not introduce a gradient or a new palette.
- Keep the message concise, include a text label (not color alone), and provide a clearly named dismiss button.
- Success toasts use `role="status"` and `aria-live="polite"`; errors that need recovery remain close to the affected control with `role="alert"`.
- Routine success toasts SHOULD dismiss after approximately 3–5 seconds and MUST be dismissible earlier. Replacing a toast resets its dismissal window.
- Respect reduced-motion preferences. Toasts must not block the underlying workflow or steal focus.
- The shared toast contract is normative even where a dedicated global Angular toast service is not yet implemented; feature-local use must preserve the same placement, accessibility and theme behavior.

### 5.10 Dialogs, modals, popovers and menus

- Use dialogs for focused tasks that require context; avoid using them for entire complex workflows when a page is clearer.
- Dialogs need a title, accessible description where needed, close/cancel behavior, focus management and keyboard escape behavior where safe.
- Destructive confirmation must state the consequence and identify the affected object.
- Menus must be keyboard accessible, anchored to their trigger and not clipped by page overflow.
- Popovers are for brief contextual content, not large forms.
- Clicking outside should not unexpectedly discard unsaved data.
- Do not nest dialogs.

### 5.10.1 Canonical modal layout and cross-feature consistency

All first-party modal dialogs MUST use one shared layout contract. Equivalent dialogs in different features (including Organization → Teams and Documents) MUST look and behave the same; feature-specific content may vary, but the overlay, panel geometry, heading, close control, body flow, footer and action-button treatment MUST NOT drift.

**Overlay and panel**
- Render the backdrop as a viewport-level sibling of the dialog panel, not inside a page/card/scroll container. It MUST use `position: fixed; inset: 0`, cover the dashboard shell and header, and use a stacking level above all application chrome (the established Teams/Documents reference is `z-index: 10000`).
- Use the shared neutral-dark `--bee-overlay` token in both Light and Dark modes, with the same restrained 8px backdrop blur (including vendor-prefixed support). Never derive the backdrop color from the active page canvas.
- Center the panel in the available viewport. The reference desktop geometry is `width: min(760px, 100%)`, `max-height: min(84vh, 820px)`, `padding: 20px`, `border-radius: 16px`, and `gap: 16px`; use the same values for equivalent dialogs unless a documented content constraint requires a deliberate variant.
- The panel MUST own its border, active surface, foreground and neutral shadow through semantic theme tokens. It MUST remain within the viewport on small screens (reference overlay inset: 12px; desktop: 24px).
- Keep the backdrop fixed while the panel/body scrolls. Long content MUST scroll inside the panel; do not scroll or blur only a nested page region.

**Header and close control**
- Use the same header structure and alignment in every modal: optional uppercase eyebrow/scope label first, then the dialog title and optional concise description; place the close icon button at the opposite edge of the same header row.
- Align header items vertically centered and keep the same gap, title size/weight/line-height, eyebrow treatment, description treatment and close-button hit area across features. The current Teams reference uses a compact 15px title and a 34px close control.
- Use the same shared icon-button class/variant and accessible name (for example, “Close dialog”); do not create feature-specific close-button geometry or hover/focus behavior.

**Body and footer**
- Keep the body between header and footer with consistent vertical rhythm. The body may scroll; header and footer remain visible when practical.
- Every modal footer MUST use the same action-row alignment: actions grouped at the inline end (right in LTR), vertically centered, with a 9px gap and a top divider/padding. Keep the same order convention: secondary action (Cancel) before primary action; destructive confirmation uses the destructive variant in the primary position.
- Reuse the same button variants/classes and dimensions as the shared application buttons. Do not independently restyle modal buttons per feature. Loading/disabled/focus/hover states must match the global button contract.
- Do not place one modal's footer actions on the left or spread them across the row while another equivalent modal uses the canonical right-aligned group.

**Behavior and accessibility**
- Use dialog semantics (`role="dialog"` or `alertdialog` for urgent destructive confirmation), `aria-modal="true"`, an accessible title and description, initial focus, contained tab navigation, Escape handling when safe, and focus restoration to the trigger.
- Close via the close control and Cancel where applicable. Clicking the backdrop MUST NOT discard unsaved work; require explicit confirmation when closing would lose meaningful input.
- Destructive dialogs MUST name the affected object and consequence. Do not rely on color alone to communicate danger.
- Respect reduced motion. Opening/closing motion must be brief and consistent; motion must not replace state or focus feedback.

**Implementation rule:** prefer a shared dialog primitive/style contract where available. If a feature still has local markup/CSS, it MUST reproduce this contract exactly rather than introducing another modal design. A deviation requires a documented reason and approval in the design-system documentation.

### 5.11 Pagination, filters and bulk actions

- Keep pagination controls and result counts consistent.
- Preserve filters when navigating pages if expected by the workflow.
- Make active filters visible and removable.
- Bulk actions must clearly show the selection scope and affected count.
- Confirm bulk destructive actions and report partial failures explicitly.

### 5.12 Loading indicators and skeletons

- Use a consistent indicator style and size.
- Skeletons should approximate the final content geometry to reduce layout shift.
- Do not use a full-page blocking loader for a small local operation.
- Keep action-specific loading feedback on the action that initiated it.
- Respect reduced-motion preferences.

## 6. Typography, spacing and geometry

Layer 1/2 define hierarchy and consistency; the active template supplies the actual font family, colors and exact skin.
- Use a predictable type scale: page title > section title > card title > body/field label > helper/meta text.
- Avoid arbitrary font sizes per component.
- Body copy should remain comfortably readable; metadata may be smaller but must remain legible.
- Use consistent line-height and avoid overly tight heading tracking.
- Use a consistent spacing scale (4px-based increments are the preferred mental model); do not create one-off values for individual screens.
- Use a small, consistent radius scale for controls, cards and dialogs.
- Avoid mixing pill, sharp and rounded styles without a semantic reason.
- Use consistent border widths and elevation levels.

Exact typography, token values, radii and surfaces are specified by the active template guide, not by this global document.

## 7. Color, theming and CSS ownership

- Feature components MUST NOT hard-code template palette hex values.
- Use semantic CSS custom properties exposed by the active template. For Midnight see its style guide and current package token definitions.
- Do not use `!important` to defeat template styles except for a documented, narrowly scoped integration fix.
- Do not set global `body`, dashboard shell or host surface styles from a feature component.
- Scope feature CSS under the component root or a unique feature prefix.
- Prefer CSS variables and shared utility/component classes over repeated local declarations.
- Avoid selectors that reach into unrelated feature internals.
- Never assume that a fallback literal color will look correct across themes.
- A missing semantic token is a design-system gap: propose and add a named token centrally, then document it. Do not invent a local hex fallback.
- Template package CSS owns template shell and theme skin; shared UI owns structural primitives; feature CSS owns only feature-specific layout details that cannot be expressed through shared primitives.

## 8. Accessibility and inclusive interaction

Target WCAG 2.2 AA as the baseline.
- All functionality must be keyboard operable.
- Focus indicators must be visible and not clipped.
- Text and control contrast must be sufficient in the active template.
- Inputs need labels; images/icons need appropriate text alternatives.
- Use semantic headings in order and landmark elements appropriately.
- Announce asynchronous errors and important updates.
- Respect `prefers-reduced-motion`.
- Do not communicate meaning by color, position or icon alone.
- Touch targets should be comfortably usable; aim for approximately 40–44 CSS px where practical.
- Avoid focus traps except in modal dialogs; restore focus to the trigger when a dialog closes.

## 9. Localization and content

- All user-facing strings must use the existing i18n service/catalog pattern; do not hard-code English/Spanish text in templates.
- Avoid concatenating translated fragments to create sentences.
- Allow labels, buttons, headings and table values to expand naturally.
- Use locale-aware date, time, number and currency formatting.
- Do not embed user-facing text inside images.
- Avoid unexplained abbreviations and internal engineering terminology.
- Error messages should be translated when generated by the UI; preserve safe server-provided localized messages where the API contract expects them.

## 10. Interaction, authorization and data integrity

Visual consistency must never weaken application rules:
- The backend remains the authority for authorization and tenant scope.
- Hiding or disabling a control is only a UX affordance, never a substitute for API permission checks.
- Do not show actions the current user cannot perform unless a disabled state with a useful explanation is intentional.
- Confirm destructive actions and make the affected entity explicit.
- Prevent duplicate submissions and stale asynchronous responses from overwriting newer state.
- Keep optimistic UI updates reversible and only use them where consistency can be guaranteed.
- Preserve unsaved edits when safe; warn before navigation when data loss is possible.

## 11. CSS and Angular implementation rules

- Follow the existing Angular component architecture and standalone/import conventions in the surrounding feature.
- Reuse existing services for i18n, permissions, API access and shared state.
- Keep business logic out of presentation primitives.
- Prefer component-scoped styles for feature-specific layout; shared primitives belong in shared UI styles/components.
- Avoid broad selectors such as `section`, `header`, `button`, `input` outside an intentionally global reset or component host.
- Avoid style attributes and runtime-generated color values.
- Avoid duplicated style declarations across pages; consolidate recurring patterns into a shared component or utility.
- Do not introduce a new CSS framework or icon library without architectural approval.
- Do not change template selection, package ownership or shell behavior from an ordinary feature page.

### 11.1 Canonical class naming

For new shared primitives, use the `bee-` prefix and BEM-style elements/modifiers:
- `.bee-page`, `.bee-page__header`, `.bee-page__content`
- `.bee-card`, `.bee-card__header`, `.bee-card__body`, `.bee-card--interactive`
- `.bee-button`, `.bee-button--primary`, `.bee-button--secondary`, `.bee-button--danger`
- `.bee-field`, `.bee-field__label`, `.bee-field__control`, `.bee-field__hint`, `.bee-field__error`
- `.bee-tabs`, `.bee-table`, `.bee-badge`, `.bee-alert`, `.bee-dialog`

These are naming conventions for shared primitives as they are implemented. Do not add empty CSS aliases or mass-rename existing classes solely to match this list.

## 12. New-feature implementation workflow

Every new page or substantial feature MUST follow this sequence:

1. Read this global guide.
2. Read the active dashboard template guide (currently Midnight).
3. Inspect existing pages and search for reusable components/patterns.
4. Sketch the page anatomy and identify page states before coding.
5. Reuse shared primitives; if a missing primitive is broadly reusable, implement it centrally.
6. Use semantic theme tokens; do not add local palette values.
7. Implement i18n, permissions, keyboard interaction and responsive behavior alongside the UI, not as afterthoughts.
8. Verify loading, empty, error, success, read-only, disabled and saving states that apply.
9. Compare the result against at least one existing harmonized page and check visual consistency.
10. Record any justified deviation and update the shared guide if the system itself changes.

## 13. Pull request design checklist

- [ ] Global Bee-Core Design System guide reviewed.
- [ ] Active template style guide reviewed (Midnight currently).
- [ ] Existing shared components/patterns searched and reused.
- [ ] Page follows the standard anatomy and heading hierarchy.
- [ ] Page states are implemented.
- [ ] Responsive layout checked at mobile, tablet and desktop widths.
- [ ] Keyboard operation and visible focus checked.
- [ ] Labels, semantics and accessible names checked.
- [ ] i18n catalogs used for all user-facing strings.
- [ ] No arbitrary template colors, local palette or broad CSS leakage.
- [ ] Permissions are enforced by the backend; UI affordances match effective permissions.
- [ ] No duplicate component/pattern introduced without justification.
- [ ] Screenshots or browser evidence included for visual changes when available.
- [ ] Deviations and remaining gaps documented honestly.

## 14. Governance and evolution

This guide changes when the shared design system changes, not whenever an individual page wants a different look.
- A new shared component requires a documented purpose, API/variants, accessibility behavior and examples.
- A new token must have a semantic name and be defined centrally by the template contract.
- A page-specific exception must be narrow, justified and preferably temporary.
- Changes to this guide should be reviewed with the shared component implementation to avoid documentation drift.
- The global guide and active template guide are a pair; new work must consult both.

## 15. Definition of done

A feature is not visually complete merely because it renders. It is design-system complete when it uses the common page/component contracts, respects the active template, covers its relevant states, is responsive and accessible, uses localization, and has no unexplained visual outliers.

### Light/dark theme compatibility for collection workspaces

- Shared collection workspaces (including Documents) MUST use the active template's semantic surface, foreground, muted, border and accent tokens. Avoid hard-coded light/dark card, text, menu or input colors.
- Overlays are the exception to surface token mixing: modal backdrops MUST use the shared neutral-dark `--bee-overlay` token in both light and dark modes so the entire underlying viewport is consistently dimmed; do not derive the backdrop from the page background token, which can turn it pale in light mode.
- Dialog shadows should use a neutral dark shadow rather than the active background token. Check dialogs, menus, selected segmented controls, empty states, tables and forms in both modes for contrast.
- Light-mode checks are required alongside dark-mode checks for first-party collection pages: primary action text, muted labels, table headers, hover rows, menu surfaces, selected/unselected view controls, borders and keyboard focus must remain readable.


## Documents theme-mode contract (implementation correction — 2026-11-23)

- Documents is a theme-aware collection workspace. A light page canvas is not sufficient: folder/document cards, overflow menus, dialogs, inputs, selected controls, chips, suggestions, empty/loading/feedback states and table surfaces must all resolve to light surfaces and dark readable foregrounds in Light mode.
- The Midnight dashboard host exposes its mode through `data-bee-dashboard-mode`. Documents component-local semantic tokens must respond to this host state without changing Midnight Dark or other features.
- Primary actions and selected view controls must use contrast-safe foregrounds; do not use the light `--bg` token as their text color in Light mode.
- Validate Cards and Table, opening every menu and dialog, in both light and dark modes. Source-level corrections do not count as browser verification.

## Collection hover treatment (Documents reference)

Cards and equivalent table rows in collection views MUST use the same restrained accent-tint hover language as Documents. The treatment is a surface-color shift, not a glow, scale, shadow, opacity or layout animation:

- Collection cards: blend the surface with the template accent at 8% (`color-mix(in srgb, var(--surface) 92%, var(--accent))`) and blend the border with the accent at 48%.
- Table rows: use a 5% accent tint over the transparent row background (`color-mix(in srgb, var(--accent) 5%, transparent)`).
- Keep transitions brief and limited to background/border colors. Selected, focused, drag-target and keyboard-focus states remain distinct and MUST NOT be replaced by hover styling.
- Apply the same treatment to equivalent card and table representations within a feature. Light and Dark modes MUST both use semantic surface/accent tokens so the tint remains subtle and readable.
- Documents is the visual reference implementation (`.documents__item:hover` and `.documents__table tbody tr:hover`).

### System-role catalog cards

System-role catalog cards MUST reuse the Organization → Teams collection-card geometry and interaction contract: responsive auto-fill grid with a 245px minimum card width, 12px gap, 13px padding, 11px radius, equal-height cards per grid row, and the same restrained accent hover treatment. A role card presents its name, description, permission count, explicit Active/Inactive status and a compact overlapping preview of the first three permission badges followed by a calculated `+N` remainder. Overflow actions use the same vertical-ellipsis menu geometry and hover behavior as Teams. Read-only system-role details open in the canonical modal; unsupported mutations remain visibly disabled rather than appearing functional.

### Roles collection view and permission marker contract

For the System Roles collection, reuse the Organization → Teams composition and control behavior: Cards/Table toggle at the collection header, Create role action, and search row. Search filters role names, descriptions and permission labels/keys. Cards and table views must represent the same filtered records and preserve the same overflow actions. Permission previews are circular initials rather than overlapping text badges; derive up to two initials from the permission label (e.g. VM, VP, VF), and show the full label in a tooltip on hover and keyboard focus. Use semantic theme tokens and preserve Light/Dark contrast. Create role routes to the existing Custom Roles editor because Core-managed system roles are not directly creatable or mutable.


### System Roles permission-circle overlap and view-toggle alignment

- Permission initials in System Roles cards and table rows are a compact overlapping stack, not separated chips. Keep a consistent negative inline-start overlap, a surface-colored 2px separator border, and stable stacking order so every circle remains identifiable.
- Keep the calculated `+N` remainder outside the stack with a clear gap; it must not overlap the final circle.
- The Cards/Table controls must be geometrically identical to Organization → Teams: 34×32px hit areas, zero button padding, a 1px border, 7px radius, and the same 17px glyphs. Center the glyph both horizontally and vertically with grid placement and a line-height of 1; explicitly reset inherited feature button padding.


### Midnight Light mode — Organization Roles
- Organization → Roles & Permissions MUST follow the same explicit Light-mode host-context strategy as Organization → Teams. Scope the override to `.bee-template-package-host--midnight[data-bee-dashboard-mode="light"]` so it cannot leak into Midnight Dark, Glass or Paper.
- Map the component's local semantic tokens to the Midnight Light palette: canvas `#f4f6fb`, panel/surface/raised surface `#fff`, foreground `#263248`, muted `#68758b`, border `#dfe5ef`, violet accent `#5542bd`, success `#167447`, warning `#946200`, danger `#b42318`, and the shared Light shadow. Cards, tabs, search, tables, menus, permission circles, tooltips and dialogs must resolve through these tokens rather than retaining dark-mode values.
- Selected Cards/Table controls and primary actions MUST retain a white foreground over the violet action surface in Light mode, matching Teams. Verify both System Roles and Custom Roles in Light and Dark.


## Organization → Users collection layout

- The Members directory MUST reuse the Documents collection toolbar composition. The toolbar is split into two equal 50% zones: search and status filter occupy the left half; Cards/Table controls occupy the right half and align to the far edge with a small right inset. Keep a consistent gap between zones and prevent controls from overflowing their half.
- The Cards/Table selector MUST use the exact Documents geometry and states: unboxed group, 5px gap, 34×32px individual buttons, 7px radius, 1px semantic border, 17px glyph, centered with grid placement and zero padding. Use aria-pressed, accessible names and visible keyboard focus.
- Users MUST offer equivalent Cards and Table representations of the same filtered members. Switching views MUST preserve search, status filtering, role changes, restriction controls and permitted member actions.
- Cards MUST render three equal columns at desktop widths, two at tablet widths and one on narrow mobile screens. Use equal card sizing within each row, 12px grid gap, semantic panel/border tokens and the same restrained Documents hover treatment. Table rows use the same 5% accent hover tint.
- The toolbar and cards MUST use active template semantic tokens and remain legible in Midnight Light and Dark. Do not introduce hard-coded theme colors or alter invitation, permission or membership behavior.
