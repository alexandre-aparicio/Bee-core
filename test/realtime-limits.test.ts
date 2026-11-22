import { test } from "node:test";
import assert from "node:assert/strict";
import { BoundedTicketStore, RealtimeConnectionLimiter } from "../src/core/realtime-limits.js";

test("bounded tickets expire, are single-use and never exceed capacity", () => {
  let now = 100;
  const store = new BoundedTicketStore<{ id: number }>(3, 30_000, () => now);
  const first = store.issue({ id: 1 });
  const second = store.issue({ id: 2 });
  const third = store.issue({ id: 3 });
  assert.ok(first && second && third);
  assert.equal(store.size, 3);
  assert.equal(store.issue({ id: 4 }), null, "capacity must reject instead of evicting live tickets");
  assert.deepEqual(store.consume(second.ticket), { id: 2 });
  assert.equal(store.consume(second.ticket), null, "tickets must be single-use");
  assert.ok(store.issue({ id: 4 }));
  assert.equal(store.size, 3);
  now += 30_001;
  assert.equal(store.size, 0, "expired records must be removed on the next operation");
  assert.equal(store.consume(first.ticket), null);
  assert.ok(store.issue({ id: 5 }));
});

test("ticket heap remains bounded under rapid issue and consume churn", () => {
  const store = new BoundedTicketStore<number>(32, 30_000);
  for (let i = 0; i < 20_000; i++) {
    const issued = store.issue(i);
    assert.ok(issued);
    assert.equal(store.consume(issued.ticket), i);
    assert.equal(store.size, 0);
  }
});

test("realtime connections enforce independent IP and user limits", () => {
  const limiter = new RealtimeConnectionLimiter(2, 1);
  const first = limiter.tryAcquire("192.0.2.10", "user-a");
  assert.ok(first);
  assert.equal(limiter.tryAcquire("192.0.2.10", "user-a"), null, "per-user limit must apply");
  const otherUser = limiter.tryAcquire("192.0.2.10", "user-b");
  assert.ok(otherUser);
  assert.equal(limiter.tryAcquire("192.0.2.10", "user-c"), null, "per-IP limit must apply");
  assert.ok(limiter.tryAcquire("192.0.2.11", "user-c"), "a different IP has an independent IP quota");
  first();
  first();
  assert.ok(limiter.tryAcquire("192.0.2.10", "user-a"), "release must be idempotent and free both quotas");
  otherUser!();
});

test("realtime connections also enforce an aggregate server limit", () => {
  const limiter = new RealtimeConnectionLimiter(10, 10, 2);
  const first = limiter.tryAcquire("192.0.2.1", "user-a");
  const second = limiter.tryAcquire("192.0.2.2", "user-b");
  assert.ok(first && second);
  assert.equal(limiter.tryAcquire("192.0.2.3", "user-c"), null, "many distinct IPs must not bypass the global cap");
  first();
  assert.ok(limiter.tryAcquire("192.0.2.3", "user-c"), "releasing a connection must free global capacity");
  second();
});
