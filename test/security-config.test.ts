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
  assert.match(nginx, /location = \/api\/auth\/login[\s\S]*?limit_req zone=auth_login/);
  assert.match(nginx, /location = \/api\/auth\/refresh[\s\S]*?limit_req zone=auth_refresh/);
  assert.match(nginx, /location = \/api\/auth\/mfa\/setup[\s\S]*?limit_req zone=auth_mfa/);
  assert.match(nginx, /location = \/api\/auth\/mfa\/confirm[\s\S]*?limit_req zone=auth_mfa/);
  assert.match(nginx, /location = \/api\/templates\/public-stream-ticket[\s\S]*?limit_req zone=stream_ticket/);
  assert.match(nginx, /location = \/api\/templates\/stream-ticket[\s\S]*?limit_req zone=stream_ticket/);
  assert.match(nginx, /limit_req_status 429/);
});

test("backend remains private to the Docker network", () => {
  const backend = compose.match(/(?:^|\n)  bee-core:[\s\S]*?(?=\n  [a-zA-Z0-9_-]+:|$)/)?.[0];
  assert.ok(backend, "bee-core service must exist");
  assert.match(backend, /expose:\s*\n\s+- ["']?3000/);
  assert.doesNotMatch(backend, /\n\s+ports:/, "backend must not publish a host port");
});
