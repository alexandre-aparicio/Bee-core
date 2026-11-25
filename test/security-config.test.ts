import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const nginx = readFileSync(new URL("../apps/web/nginx.conf", import.meta.url), "utf8");
const compose = readFileSync(new URL("../docker-compose.yml", import.meta.url), "utf8");

test("authentication and stream-ticket endpoints have independent IP rate limits", () => {
  assert.match(nginx, /zone=auth_login:10m rate=5r\/m/);
  assert.match(nginx, /zone=auth_refresh:10m rate=10r\/m/);
  assert.match(nginx, /zone=auth_mfa:10m rate=3r\/m/);
  assert.match(nginx, /zone=stream_ticket:10m rate=30r\/m/);
  assert.match(nginx, /zone=platform_admin:10m rate=120r\/m/);
  assert.match(nginx, /location = \/api\/auth\/login[\s\S]*?limit_req zone=auth_login/);
  assert.match(nginx, /location = \/api\/auth\/refresh[\s\S]*?limit_req zone=auth_refresh/);
  assert.match(nginx, /location = \/api\/auth\/mfa\/setup[\s\S]*?limit_req zone=auth_mfa/);
  assert.match(nginx, /location = \/api\/auth\/mfa\/confirm[\s\S]*?limit_req zone=auth_mfa/);
  assert.match(nginx, /location = \/api\/templates\/public-stream-ticket[\s\S]*?limit_req zone=stream_ticket/);
  assert.match(nginx, /location = \/api\/templates\/stream-ticket[\s\S]*?limit_req zone=stream_ticket/);
  assert.match(nginx, /location = \/api\/notifications\/realtime-ticket[\s\S]*?limit_req zone=stream_ticket/);
  assert.match(nginx, /location \^~ \/api\/platform\/[\s\S]*?limit_req zone=platform_admin/);
  assert.match(nginx, /limit_req_status 429/);
  assert.match(nginx, /script-src 'self'/);
  assert.doesNotMatch(nginx, /script-src[^;]*unsafe-inline/);
  assert.match(nginx, /Cross-Origin-Opener-Policy "same-origin"/);
  assert.match(nginx, /Cross-Origin-Resource-Policy "same-origin"/);
  assert.match(nginx, /client_max_body_size 11m/);
  assert.match(nginx, /X-Forwarded-For \$remote_addr/);
  assert.doesNotMatch(nginx, /\$proxy_add_x_forwarded_for/);
});

test("backend remains private to the Docker network", () => {
  const backend = compose.match(/(?:^|\n)  bee-core:[\s\S]*?(?=\n  [a-zA-Z0-9_-]+:|$)/)?.[0];
  assert.ok(backend, "bee-core service must exist");
  assert.match(backend, /expose:\s*\n\s+- ["']?3000/);
  assert.doesNotMatch(backend, /\n\s+ports:/, "backend must not publish a host port");
});


test("Connected Devices companion transport keeps the explicit Capacitor CORS and CSP policy", () => {
  const server = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const simulator = readFileSync(new URL("../apps/web/src/assets/device-simulator/device-simulator.js", import.meta.url), "utf8");
  assert.match(server, /https:\\/\\/localhost,capacitor:\\/\\/localhost/, "native simulator origins remain explicit");
  assert.match(server, /"x-device-pairing-secret"/, "the pairing-secret header remains preflight-allowlisted");
  assert.match(server, /"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"/);
  assert.match(server, /Access-Control-Allow-Headers/);
  assert.doesNotMatch(server, /Access-Control-Allow-Origin[^\\n]*\\*/);
  assert.match(nginx, /connect-src 'self'/, "the standalone same-origin simulator can reach the API");
  assert.match(server, /connect-src 'none'/, "sandboxed package assets must continue to use the host API bridge");
  assert.match(simulator, /"x-device-pairing-secret":credential/);
});
