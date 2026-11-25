# Template semantic token mapping

This is the final token ownership map; it replaces temporary migration notes that described compatibility aliases as pending removal.

## Current contract

- `templates/base/tokens.contract.css` is authoritative and declares 89 semantic `--bee-*` tokens.
- All six package `tokens.css` files define all 89 tokens in both Light and Dark.
- `base/base.css` contains shared structure and neutral fallbacks, not a package palette.
- Package styles and feature components consume semantic variables.
- The active package/mode is mirrored to `html[data-bee-active-template][data-bee-active-mode]` and the package host.

| Role | Semantic tokens |
|---|---|
| Canvas and surfaces | `--bee-bg`, `--bee-surface`, `--bee-surface-raised`, `--bee-surface-deep`, `--bee-surface-subtle`, `--bee-surface-hover`, `--bee-surface-active` |
| Foreground and links | `--bee-text`, `--bee-text-muted`, `--bee-text-subtle`, `--bee-text-inverse`, `--bee-link` |
| Borders and focus | `--bee-border`, `--bee-border-strong`, `--bee-focus-ring` |
| Brand/action | `--bee-accent`, `--bee-accent-strong`, `--bee-accent-hover`, `--bee-accent-soft`, `--bee-accent-text`, `--bee-secondary`, `--bee-action-text` |
| Status | `--bee-status-success*`, `--bee-status-warning*`, `--bee-status-danger*`, `--bee-status-info*` |
| Controls | `--bee-input-bg`, `--bee-input-border`, `--bee-input-placeholder` |
| Elevation and shape | `--bee-shadow`, `--bee-shadow-raised`, `--bee-overlay`, `--bee-overlay-strong`, `--bee-blur`, `--bee-radius-*` |
| Public/dashboard composition | `--bee-public-*` and `--bee-dashboard-*` tokens in the contract |

## Removed aliases

Do not reintroduce `--bg`, `--panel`, `--muted`, `--border`, `--purple` or `--cyan`. The client custom-palette adapter is removed. The backend legacy `/templates/theme` endpoint remains unchanged for compatibility, but the current client ignores legacy custom-token fields.

## Guardrails

Strict audit rejects literal hex, RGB/HSL/HWB/Lab/LCH/OKLab/OKLCH/color() functions, CSS named colors, `!important`, `[class*=` color hacks, old `md-`/`pd-`/`gd-` prefixes and removed aliases. Only package token sheets, the contract and the independent device-simulator directory are allowlisted.
