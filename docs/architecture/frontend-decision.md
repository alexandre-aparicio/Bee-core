# Frontend contract — Level B decision

## Scope

Level A remains the native host registration contract: a plugin registers an ID, a lazy component loader (when it has a native UI), navigation entries, input mapping and its own English/Spanish catalogue. The host owns navigation, tenant selection and authenticated API transport.

Level B is intentionally not implemented in this phase. It concerns loading UI shipped inside signed plugin ZIPs without statically bundling the component in the Angular host.

## Options

| Option | Isolation | Theming | Authentication boundary | Estimated effort |
|---|---|---|---|---|
| Sandboxed iframe | Strong browser-origin boundary when served from a dedicated plugin origin; sandbox can omit same-origin and top-navigation privileges | Pass a documented subset of --bee-* CSS custom properties; no direct host DOM access | Preferred: short-lived, audience-bound, plugin-scoped capability token exchanged through a host bridge; never expose the tenant's long-lived bearer token to plugin JavaScript | High |
| Web Component | Low-to-medium; shares the host document, CSS cascade and JavaScript realm | Best visual integration; inherits --bee-* tokens naturally | Host still needs a narrow API bridge; plugin code shares the page's security context | Medium |
| Native lazy Angular component | Host-level isolation only; code executes in the trusted application bundle | Full access to design tokens and Angular services | Host injects authenticated services and typed inputs | Low; this is Level A |

## Recommendation

Keep Level A for first-party native UI and use a sandboxed iframe for independently distributed ZIP frontends. Serve plugin assets from an isolated origin, enforce a strict CSP, allow only the declared API prefixes, and communicate with a versioned postMessage protocol. The host should mint short-lived, tenant- and plugin-scoped credentials; a plugin must never receive the general-purpose session token.

The host should expose a stable, documented subset of --bee-* design tokens and pass theme/language as initialization data. A plugin must still render acceptably when an optional token is absent.

## Decision required

Owner approval is required before implementing Level B. No iframe/web-component sandbox, credential exchange or ZIP UI loader is introduced by this phase.