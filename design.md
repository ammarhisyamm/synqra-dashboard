# Synqra Design System

This is the source of truth for every new screen, feature, and component in Synqra. Preserve the existing calm, editorial workspace style: white surfaces, dark navy primary actions, blue-grey supporting UI, fine borders, and restrained semantic colour. Do not introduce a visual framework, a new font family, gradients, or a new accent palette without updating this document first.

## 1. Foundations

### Brand and colour

Use CSS custom properties for new work. Existing literal values should be migrated only when a component is otherwise being changed.

```css
:root {
  --color-primary: #111b30;
  --color-primary-hover: #25334a;
  --color-primary-soft: #edf1f6;
  --color-text: #172238;
  --color-text-secondary: #526075;
  --color-text-muted: #718199;
  --color-text-subtle: #98a6b9;
  --color-surface: #ffffff;
  --color-surface-subtle: #f3f6f9;
  --color-canvas: #f7f9fc;
  --color-border: #dfe7f0;
  --color-border-strong: #c9d5e3;
  --color-focus: #526784;
  --color-focus-ring: #e1e8f0;
  --color-success: #248764;
  --color-warning: #a76d2a;
  --color-danger: #c24d4d;
  --color-info: #526784;
}
```

- Primary (`--color-primary`) is for the main CTA, active navigation, and primary progress only.
- Neutral surfaces and borders carry most of the interface. Do not use primary as a large background fill.
- Semantic colours communicate state; never use them as a second brand palette.
- Text must use the text tokens above. Placeholder and disabled copy use `--color-text-subtle`.

### Typography

Font stack: `"Inter Tight", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.

| Token | Size / line-height | Weight | Use |
| --- | --- | --- | --- |
| `display` | 28px / 1.2 | 500 | Page title only |
| `heading-lg` | 24px / 1.25 | 500 | Dialog title or primary panel heading |
| `heading` | 20px / 1.3 | 500 | Standard page heading |
| `section` | 16px / 1.35 | 500 | Section/card title |
| `body` | 14px / 1.5 | 400 | Default reading and form text |
| `ui` | 13px / 1.4 | 400–500 | Buttons, controls, table cells |
| `caption` | 12px / 1.4 | 400–500 | Supporting metadata |
| `eyebrow` | 10–11px / 1.3 | 500 | Uppercase category labels, +0.08em tracking |

Rules:

- Use `500` as the strongest routine UI weight. Reserve `600` for a compact, high-emphasis value only; never use `700` for normal UI, buttons, or card titles.
- Headings use `letter-spacing: -0.02em` to `-0.01em`; captions and uppercase labels use positive tracking.
- Body copy uses a unitless line-height of `1.5` or greater. Use `text-wrap: balance` on short headings and `text-wrap: pretty` on descriptions.
- Inputs use 16px text at mobile widths to prevent iOS focus zoom; desktop controls can use 13px.
- Counts, timers, dates, and KPI values use `font-variant-numeric: tabular-nums`.

### Spacing

Use a 4px base unit. Do not add one-off margins or padding values unless an existing component demands it.

| Token | Value | Typical use |
| --- | --- | --- |
| `space-1` | 4px | Icon/text micro-gap |
| `space-2` | 8px | Control gap, compact card gap |
| `space-3` | 12px | Field spacing |
| `space-4` | 16px | Card padding / standard gap |
| `space-5` | 20px | Section-internal spacing |
| `space-6` | 24px | Section gap |
| `space-8` | 32px | Desktop page inset |
| `space-10` | 40px | Large page separation |
| `space-12` | 48px | Major content separation |

Desktop page padding is `32px clamp(20px, 3vw, 44px) 72px`; mobile page padding is `20px 16px 58px` unless a dedicated full-bleed editor needs different treatment.

### Shape, borders, and elevation

| Token | Value | Use |
| --- | --- | --- |
| `radius-sm` | 7px | Input, compact button |
| `radius-md` | 9–10px | Card, regular button, select |
| `radius-lg` | 12px | Feature card, panel |
| `radius-xl` | 14–16px | Modal / prominent panel |
| `border` | 1px solid `--color-border` | Standard component outline |
| `shadow-card` | `0 1px 2px #17223808` | Draggable/task card only |
| `shadow-overlay` | `0 20px 60px #111b3040` | Modal, menu, date picker |

Keep standard cards flat. Elevation is for floating controls and draggable cards, not every container.

### Icons and avatars

- Use Phosphor icons only, at `14px`, `16px`, or `20px`.
- Icons next to a label use the same neutral text colour as the label; do not mix icon colour families inside a single control.
- Icon-only buttons must be square, centered, have an `aria-label`, and retain a 35–36px target.
- Use one avatar treatment: circular, dark primary background, white 2-character initials. Sizes: 24px in dense rows, 32px default, 40px account profile.

## 2. Layout and responsive rules

### CSS maintenance and wrapping baseline

- Keep design tokens in `design-system.css`; keep cross-feature layout convergence rules in `baseline-ui.css`.
- Do not add another feature-specific `!important` override for sizing, wrapping, or spacing. Fix the component rule or add one documented baseline rule instead.
- Grid children must use `min-width: 0`; controls inside a grid track must use `width: 100%` and `max-width: 100%`.
- Toolbar controls are content-sized by default, with `flex-wrap: wrap`; search/project controls may grow, while action buttons must not stretch to fill unrelated space.
- Long labels, descriptions, activity text, and user-generated content use `text-wrap: pretty` and `overflow-wrap: anywhere`. Truncate only compact controls where preserving one-line rhythm is intentional.
- Mobile field groups collapse to one column at 720px. Never solve overflow by shrinking text below the typography scale.
- New fixed elements must include `env(safe-area-inset-bottom)` where appropriate and use the shared z-index scale.

### Grid

- Use CSS grid for page layouts and field groups; use flexbox for one-dimensional alignment.
- Main dashboard: `minmax(0, 1fr) 300px`; collapse to one column at 900px.
- Form grids: two equal columns with `minmax(0, 1fr)` and a 12px gap; collapse to one column at 650px.
- Board columns stay horizontally scrollable below their comfortable width. Do not squeeze cards below 220px.
- Toolbars must use `flex: 1; min-width: 0` for expandable controls. Search fills available space; select controls have a minimum width and do not overlap neighbors.

### Breakpoints

| Breakpoint | Rule |
| --- | --- |
| Desktop: > 1180px | Full workspace, multi-column toolbars |
| Tablet: 721–1180px | Stack complex toolbars, preserve readable fields |
| Mobile: ≤ 720px | 16px horizontal inset, one-column form grid, icon-only compact actions when text is hidden |
| Narrow mobile: ≤ 650px | Sidebar becomes overlay; button labels may be hidden only when the icon remains centered and accessible |

Never rely on `hug-content` for a toolbar group that includes a search field or multiple selects. Never allow text to overlap, clip without ellipsis, or force a native dropdown beyond the viewport.

## 3. Component contracts

### Buttons

Only use these variants for new controls:

| Variant | Appearance | Use |
| --- | --- | --- |
| Primary | Navy fill, white text | One main action per context |
| Secondary | White surface, border, dark text | Adjacent non-destructive action |
| Ghost / text | No container, muted text | Low-priority navigation or cancel |
| Danger | White surface, danger border/text | Irreversible action |

Default height is 36px. Use 13px UI text at weight 500. Include a 7–8px icon gap. Disabled controls use opacity and must not look enabled.

### Inputs, search, and select

- **Master component (required):** every labeled form field uses `Field`, `TextField`, or `TextAreaField` from `src/components/common/Field.jsx`. They render the `.field` / `.field-label` / `.field-input` anatomy, so typography, spacing, focus ring, and placeholders are identical everywhere by construction. Do not write raw `<label><input></label>` patterns in new code; migrate them when touching a form.
- `SelectField` (shared select-with-label) is built on `Field` + `AppSelect` and is the only way to render a labeled select.
- Standard inputs/selects: 40px high, `radius-md`, 1px border, 11–12px horizontal padding.
- Compact search/filter controls: 36px high.
- Label sits above the field with a 7px gap. Each field takes the full width of its grid track.
- Form label contract: 12px, weight 500, `--color-text-secondary`. Never 600/700, never uppercase, and the same in every modal, settings, auth, and detail form.
- Field text contract: 13px, weight 400, `--color-text`. Fields must set weight and size explicitly — never inherit them from the label.
- Placeholder contract: `--color-text-subtle` (`--ui-placeholder`, #98a6b9), weight 400, same size as the field text. Placeholders are never bold and never use a second colour; write them as short examples or prompts ("e.g. …", "Add …", "Search …").
- Display-size title inputs (meeting title, task detail title) are the only weight-500 inputs; they are not labelled fields.
- Assignee (multi): `MultiCheckSelect` with `AssigneeOption` (avatar, name, email hint) and an avatar-stack prefix — same anatomy as the Board Team filter. Selections persist as the `assignees` array (max 8); `assignee` remains the primary (first) value so tables, cards, and filters keep working unchanged.
- Use the shared `AppSelect` component for custom menus; do not introduce unstyled platform-select UI for new functionality.
- On focus: border `--color-focus` plus a 3px `--color-focus-ring` ring.
- Always provide an empty option or placeholder when a field is optional. Do not prefill people or past dates unless explicitly required by the user.

### Cards, list rows, and tables

- Default card: white, 1px border, `radius-lg` or `radius-md`, 16px padding.
- Clickable cards must be `<button>` or an accessible link; do not use a clickable `article`/`div`.
- List rows have 12–16px vertical padding and a divider. Keep title, metadata, and actions visually distinct.
- Task title weight is 500, not bold. Supporting metadata is caption size and muted.
- Task cards use a soft shadow only while draggable or elevated.

### Pills and status

- A pill is compact metadata, not a button.
- Shape: 999px radius, 4px vertical / 8px horizontal padding, 11–12px text.
- Use a leading 5–7px status dot rather than colouring all body copy.
- Status mapping: Open muted slate, In Progress/info indigo, Review/warning amber, Resolved/Completed success green, Rejected/Blocked danger red.

### Modal and confirmation dialog

- One backdrop: `position: fixed`, `z-index: 70`, navy at approximately 47% opacity.
- Standard modal: width 520px max, 28px padding, `radius-xl`, overlay shadow.
- Confirmation dialog: width 400px max and may use centered copy.
- Every modal requires `role="dialog"`, `aria-modal="true"`, a labelled title, visible close button, Escape handling, and backdrop click where it is safe.
- Footer actions align to the end on desktop and remain reachable on mobile. Do not make field labels inline with inputs.

### Loading, empty, errors, and toast

- Empty state: one shared dashed-border panel with a relevant 16–20px icon, concise title, one sentence, and optional primary CTA.
- Loading: one shared spinner/skeleton pattern; do not invent page-specific loading wording.
- Error: explain what failed and give a recovery action if available. Never claim success after a rejected request.
- Toast has `success`, `error`, `warning`, and `info` variants; icon must match variant. Stack multiple toasts rather than overwriting a critical error.

## 4. Interaction, motion, and accessibility

- Hover changes background/border subtly. Avoid bouncy or decorative motion.
- Respect `prefers-reduced-motion`; loading animation must stop there.
- Keyboard focus is visible on every interactive element. Use semantic buttons for actions and labels for form controls.
- Minimum interactive target: 35px desktop, 40px mobile where space allows.
- Do not communicate meaning by colour alone; combine icon, label, or dot/pill text.
- Maintain readable contrast for all normal text and state labels.

## 5. Implementation workflow

Before implementing a component or feature:

1. Reuse an existing primitive (`AppSelect`, button class, modal, pill, empty state) before creating a new one.
2. Select tokens from this document rather than introducing raw colours, arbitrary sizes, or a new font weight.
3. Test desktop, tablet, and 375px mobile widths with long titles, empty values, and error states.
4. Verify keyboard access, focus, close behaviour, and loading/error feedback for every request.
5. Update this document when a reusable decision changes. Do not fork a local visual convention.

## 6. Applied UI coverage

The shared primitives and token layer are the default for every new or touched control. Feature migration is tracked explicitly so compatibility CSS is not removed before the page has been checked at desktop, tablet, and 375px widths.

| Surface | Migration state | Compatibility CSS scope |
| --- | --- | --- |
| Shell, sidebar, top bar, project switcher, notifications, command palette | Shared controls adopted; layout compatibility retained | `styles.css`, `fixes.css` |
| Overview / dashboard | Shared buttons, pills, cards, and fields adopted | `styles.css`, `design-system.css` |
| Reviews list and review modal | Shared fields, selects, dialogs, pills, and CSV action adopted | `styles.css`, `fixes.css` |
| Task-detail drawer | Feature-owned detail/workflow styles; shared selects, fields, dialogs, and status primitives | `detail.css`, `detail-overrides.css`, `workflow.css` |
| Meetings, editor, and AI review | Feature-owned workflow styles; shared fields/selects/dialogs where touched | `workflow.css`, `styles.css` |
| Reports | Shared cards, selects, pills, and report overview styling | `styles.css`, `design-system.css` |
| Settings, archive, and admin | Shared fields, dialogs, pills, and common layout contract | `styles.css`, `design-system.css` |
| Kanban list, board, sprint planning, timeline, metadata dialogs | Specialized board layout retained; shared toolbar/select/dialog contract | `kanban-convergence.css`, `metadata.css`, `kanban-workspace.css`, `fixes.css` |

Legacy styles may remain for structural compatibility, but `src/design-system.css` is loaded last and owns the final visual contract. A feature is incomplete if it bypasses shared primitives for a newly touched control or introduces a competing palette, type scale, radius, or field anatomy.

## 7. Source of truth for implementation

The visual system is implemented by the token layer in `src/styles/globals.css` and the compatibility layer in `src/design-system.css`. New Tailwind components must consume the shadcn-compatible variables (`--background`, `--primary`, `--border`, and related tokens) through `cn()` and utility classes. Feature CSS that still exists must consume the `--ui-*` tokens instead of adding raw colour, radius, shadow, or font-weight values. Legacy styles remain only while their feature is being migrated and verified.

| Need | Required primitive / rule |
| --- | --- |
| Menu or select | `AppSelect` backed by Radix Select; no new native `<select>` UI in product flows |
| Dialog, confirm, or popup | `Modal` / `ActionDialog` anatomy: backdrop, labelled title, close action, Escape handling, and shared footer |
| Labeled text field, textarea, date, password | `TextField` / `TextAreaField` / `Field` from `components/common/Field.jsx` — never a raw `<label><input>` pair |
| Text field, textarea, date, number | 40px field contract with label above, full grid-track width, and shared focus ring |
| Board / dashboard toolbar | Search grows, controls use a minimum width, and wrapping happens before overlap |
| New component | Start from the nearest existing primitive, then update this guide if a reusable pattern changes |

Do not add an isolated component-specific “design fix” when a shared primitive can solve it. If a new pattern is genuinely needed, first document its token, responsive behaviour, states, and accessibility contract here; then implement it in the shared layer.

## 8. Migration and cache contract

- New UI work uses `src/components/ui/` primitives and Tailwind v4 utilities first. Existing feature CSS is compatibility-only and must be removed after visual verification, not copied into another global file.
- `src/components/common/AppSelect.jsx` uses Radix Select for focus management, keyboard navigation, Escape handling, and portal positioning while retaining the Synqra class contract during migration.
- Cloudflare serves the HTML shell with `no-store` so deployments pick up the newest Vite manifest immediately. Fingerprinted `/assets/*.css` and `/assets/*.js` files use immutable one-year caching; non-fingerprinted public assets revalidate hourly.
- User data in `localStorage` is not cleared as part of a UI deploy. Application data is product state, not a disposable browser cache.
- API responses are treated as user/workspace state and must use `Cache-Control: no-store`; the client API wrapper also requests `no-store` by default.
- Feature CSS imports belong with the feature when practical. Do not promote detail, meeting workflow, or Kanban compatibility rules back into the global entrypoint.
- Verification is required before deleting compatibility rules: production build, automated tests, CSS diff check, and a visual pass at desktop, tablet, and narrow mobile widths with long/empty content.
