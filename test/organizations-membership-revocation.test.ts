import { test } from "node:test";
import assert from "node:assert/strict";
import { completePendingDeviceRevocationBeforeReactivation } from "../src/plugins/organizations/organizations.plugin.js";

test("membership reactivation waits for the pending device revocation cascade", async () => {
  let pending = true;
  let emitted = false;
  const completed = await completePendingDeviceRevocationBeforeReactivation({
    emitSuspensionEvent: async () => {
      emitted = true;
      pending = false;
    },
    hasPendingRevocation: async () => pending
  });
  assert.equal(emitted, true);
  assert.equal(completed, true);
});

test("membership cannot reactivate when no listener completes the pending cascade", async () => {
  const completed = await completePendingDeviceRevocationBeforeReactivation({
    emitSuspensionEvent: async () => {},
    hasPendingRevocation: async () => true
  });
  assert.equal(completed, false);
});

test("membership cannot reactivate when the revocation event fails", async () => {
  let checked = false;
  await assert.rejects(
    completePendingDeviceRevocationBeforeReactivation({
      emitSuspensionEvent: async () => { throw new Error("outbox unavailable"); },
      hasPendingRevocation: async () => { checked = true; return false; }
    }),
    /outbox unavailable/
  );
  assert.equal(checked, false);
});
