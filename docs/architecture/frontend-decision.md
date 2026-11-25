# Plugin frontend contract decision

## Current mandatory contract (Level A)

The host owns navigation, authentication, tenant context and lifecycle. Feature modules contribute a registration containing:

- stable plugin ID;
- lazy component loader;
- navigation entry and optional child sections/routes;
- input mapping for tenant ID, role, access token and active section;
- optional English and Spanish catalogues.

The host registry is generic. It does not import or branch on individual module IDs. The module owns its component, navigation metadata and translations. The host passes only the inputs declared by the registration. This is the current implementation boundary for first-party native Angular modules.

## Level B options — not implemented

| Option | Benefits | Costs and risks |
|---|---|---|
| Sandboxed iframe + signed ZIP (current external-package direction) | Strong DOM/CSS isolation; package-owned runtime; explicit asset and API-prefix allowlists | Cross-frame messaging, accessibility, responsive sizing and theming bridge |
| Web Components / Custom Elements | Framework-neutral packages; shared document and easier host embedding | CSS leakage unless Shadow DOM is used; Angular interoperability and lifecycle work |
| Remote ESM / Module Federation | Native-feeling integration and shared runtime | Shared dependency/version conflicts; larger trust boundary; deployment and cache invalidation complexity |

## Host theming contract

The host exposes design tokens through the `--bee-*` CSS custom-property namespace. A future Level B bridge must document supported semantic tokens (surface, text, muted text, border, accent, focus, radius and spacing), inherit the active light/dark theme, and avoid depending on private template selectors. Sandboxed packages should receive only the documented token contract, not unrestricted host styles.

## Authentication and tenant boundary

The host remains the sole owner of bearer credentials. A remote frame must never receive the raw access token through `postMessage`, URL parameters or iframe attributes. Requests must go through a host-controlled bridge that validates the package ID, tenant, HTTP method and manifest-declared API prefixes. Messages must be schema-validated and accepted only from the registered frame window. The package must not be able to choose an arbitrary origin or API prefix.

## Recommendation and owner decision

Keep Level A as the mandatory first-party contract and use the signed ZIP + sandboxed iframe direction for third-party Level B packages. Add a narrow, versioned host bridge and a documented `--bee-*` token contract before exposing more APIs. Do not implement Web Components or remote ESM until there is a concrete package requiring them.

**Awaiting owner decision:** confirm whether Level B should remain sandboxed iframe-only, or whether first-party modules should also be allowed to ship as Web Components. Level B implementation is not verified and is intentionally out of scope until that decision.
