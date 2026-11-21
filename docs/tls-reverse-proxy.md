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
