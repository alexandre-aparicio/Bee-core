# Plugin frontend architecture decision

## Current models

| Level | Modules | Runtime contract |
|---|---|---|
| A — Native Angular | Documents and Control Horario | Host-registered lazy Angular components. The host owns navigation, authentication, tenant context, lifecycle and translations; each module supplies its component and registration metadata. |
| B — Sandboxed signed ZIP | Connected Devices | A verified signed ZIP supplies the frontend entrypoint, loaded in an iframe with `sandbox="allow-scripts"`. The frame has no direct credential access and calls APIs only through the host bridge. |

The generic frontend registry is the Level A integration point. It accepts a plugin ID, lazy component loader, navigation metadata, input mapping and optional EN/ES catalogues. It must not import or branch on individual module IDs. Documents and Control Horario are native registrations; Connected Devices is intentionally not an Angular host registration.

## When to use each model

Use Level A when a first-party module needs deep Angular composition, shared host navigation, native routing, host-managed translations or close integration with the dashboard lifecycle.

Use Level B when a module is independently packaged and published as a signed ZIP and benefits from a separate DOM/CSS/runtime boundary. The manifest declares its entrypoint, API prefixes and navigation routes. The host validates the frame window and routes permitted API calls; the frame never receives the bearer token.

The current model is an implementation choice, not a permanent classification. Convergence, migration of an existing module, or adoption of another model is an owner decision based on product, security and maintenance needs. Do not migrate modules merely for architectural uniformity.

## Host theming contract for Level B

After a frame sends `bee-plugin:ready`, the host sends `bee-plugin:init` and then `bee-plugin:theme`. The host repeats the theme message whenever the active template or appearance mode changes. The message contains `colorScheme` (`light` or `dark`) and a `tokens` object resolved with `getComputedStyle` from the active host template element. It must not contain raw palette values authored in host code, bearer tokens, JWTs, credentials or other secrets.

The semantic token keys are:

- `surface`, `surface-raised`, `text`, `text-muted`, `border`;
- `accent`, `accent-text`, `focus-ring`;
- `status-success`, `status-warning`, `status-danger`, `status-info`;
- `radius-sm`, `radius-md`, `radius-lg`.

A Level B frame defines safe fallback values for these CSS custom properties (`--bee-*`) and applies received values to its own document. It must validate the message source as its parent. The host must validate incoming messages against the registered frame window. Keep `sandbox="allow-scripts"`; do not add `allow-same-origin`, and do not send credentials in any postMessage payload.

## Authentication and tenant boundary

The host remains the sole owner of bearer credentials. Remote requests go through the host-controlled API bridge, which validates the registered package ID, frame source, HTTP method and manifest-declared API prefixes. The frame cannot select an arbitrary origin or API prefix. The bridge returns only the API response, not the host credential.

## Decision record

Level A and Level B are both implemented and in use as described above. Keep the current per-module model until the owner explicitly decides to converge or change it. Web Components, remote ESM and Module Federation are not current production contracts.


## Package manifest ownership

Package permissions are owned by each plugin folder in `src/plugins/<plugin-id>/plugin.manifest.ts`. The platform manifest registry composes these module-owned definitions for trusted platform consumers. The ZIP package builder discovers plugin folders containing `plugin.manifest.ts`, loads the compiled manifests, and copies their permission definitions into signed package metadata. Do not duplicate module permission arrays in the builder or central registry. The generic Core permission catalogue remains reserved for Core-owned capabilities.
