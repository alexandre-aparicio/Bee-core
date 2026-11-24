import test from "node:test";
import assert from "node:assert/strict";
import { deliveryVisibilityFilter, canTransitionDelivery } from "../src/plugins/deliveries/deliveries.plugin.js";

test("delivery workflow accepts only declared forward/recovery transitions", () => {
  assert.equal(canTransitionDelivery("draft","assigned"), true);
  assert.equal(canTransitionDelivery("assigned","picked_up"), true);
  assert.equal(canTransitionDelivery("picked_up","in_transit"), true);
  assert.equal(canTransitionDelivery("in_transit","delivered"), true);
  assert.equal(canTransitionDelivery("in_transit","draft"), false);
  assert.equal(canTransitionDelivery("delivered","failed"), false);
  assert.equal(canTransitionDelivery("cancelled","assigned"), false);
});

test("members receive an assigned-to-self filter while managers receive the full tenant scope", () => {
  assert.deepEqual(deliveryVisibilityFilter("user-a", false), { assignedTo: "user-a" });
  assert.deepEqual(deliveryVisibilityFilter("user-a", true), {});
});
