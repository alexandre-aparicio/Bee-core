# Production TLS and reverse proxy

The production Compose profile keeps the Bee-Core API and MongoDB off public host ports. The web container is exposed on the configured host port (3011 by default) for a trusted reverse proxy such as Nginx Proxy Manager. TLS must terminate at that public reverse proxy; the internal web-to-API connection remains on the private Docker network.

## Required reverse-proxy settings

For the Bee-Core hostname:

- Attach a valid certificate and enable automatic renewal.
- Redirect all HTTP requests to HTTPS.
- Permit TLS 1.2 and TLS 1.3 only; disable older protocols and weak cipher suites.
- Enable HTTP/2.
- Forward the original host and set `X-Forwarded-Proto: https` for HTTPS requests.
- Do not expose the backend port 3000 or MongoDB port 27017 publicly.
- Keep the proxy-to-web upstream on the private host/network and restrict access to the web port to the proxy where possible.

The bundled Nginx configuration emits HSTS (one year, including subdomains) only when the trusted upstream marks the original request as HTTPS. It also sets baseline content, framing, referrer and permissions headers. Do not enable HSTS with `includeSubDomains` unless every subdomain is HTTPS-ready.

The backend marks dashboard refresh cookies `Secure` whenever `NODE_ENV=production`. A production deployment therefore requires HTTPS; testing the production profile over plain HTTP will not preserve the refresh cookie.

## Verify after deployment

1. Open the public hostname and confirm the browser reports a valid HTTPS certificate.
2. Confirm HTTP redirects to HTTPS.
3. Inspect response headers for `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy`.
4. Sign in, confirm the `bee_refresh` cookie is marked HttpOnly, Secure and SameSite=Strict, and verify it is scoped to `/api/auth`.
5. Confirm no public listener is reachable for MongoDB or the backend API.

TLS certificate provisioning and reverse-proxy configuration are deployment-environment responsibilities; this repository does not provision a public certificate automatically.


## Backend network isolation and browser security headers

The base `docker-compose.yml` publishes only the web/Nginx container. The API service declares
`expose: 3000` for Docker-network communication and has no host `ports` mapping. The web
container reaches it by the Compose service name `bee-core:3000`; clients must use the web
proxy and must not connect directly to the API. The production override keeps the same
private-network-only API exposure.

For local development, use the web entry point (port 8080 by default). Do not restore a
`3000:3000` mapping. If temporary direct debugging is unavoidable, use a separate local-only
override bound explicitly to `127.0.0.1:3000`, and remove it before deployment.

The bundled Nginx configuration adds a restrictive Content Security Policy:
- `script-src 'self'` does not permit inline scripts or `eval`.
- `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'` and `form-action 'self'`
  constrain plugin content, base URL changes, framing and form submission.
- `connect-src` permits same-origin API requests and same-origin WebSocket upgrades.
- `style-src 'self' 'unsafe-inline'` is the only deliberate exception. Angular component
  styling and runtime style bindings can emit style attributes/elements; allowing inline styles
  avoids breaking those UI paths while scripts remain restricted. Replace this exception with
  nonce/hash-based styling only after a browser audit proves every generated style is covered.
- COOP is `same-origin` and CORP is `same-origin`; external resources are intentionally not
  loadable as subresources. Revisit these policies if a future integration requires cross-origin
  popups or assets.

Nginx keeps a 1 MiB default request limit and raises the `/api/files` route to 11 MiB to allow a
10 MiB upload plus multipart/form-data overhead.

## Local verification checklist

Run these checks against the local Compose deployment (not against GitHub Actions):

1. `docker compose config` and confirm `bee-core` has `expose: 3000` and no host port mapping.
2. `curl -I http://127.0.0.1:8080/` and inspect CSP, COOP and CORP headers.
3. Confirm `curl http://127.0.0.1:3000/health` fails from the host while the web proxy can still
   reach the API.
4. Open the app in headless Chromium and check the console for CSP violations and runtime errors.
5. Upload a real 10 MiB file through the UI and verify the resulting API response and stored file.
