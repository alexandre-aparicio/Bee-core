import test from "node:test";
import assert from "node:assert/strict";
import { deliveryVisibilityFilter, isValidSignatureStrokes, canTransitionDelivery } from "../src/plugins/deliveries/deliveries.plugin.js";

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
  assert.deepEqual(deliveryVisibilityFilter("user-a", true, "mine"), { assignedTo: "user-a" });
  assert.deepEqual(deliveryVisibilityFilter("user-a", true, "unassigned"), { assignedTo: null });
  assert.deepEqual(deliveryVisibilityFilter("user-a", false, "all"), { assignedTo: "user-a" });
});

test("proof-of-delivery signatures are bounded normalized strokes", () => {
  assert.equal(isValidSignatureStrokes([[{x:0,y:0},{x:1,y:1}]]), true);
  assert.equal(isValidSignatureStrokes([]), false);
  assert.equal(isValidSignatureStrokes([[{x:1.1,y:0}]]), false);
  assert.equal(isValidSignatureStrokes([[{x:0,y:Number.NaN}]]), false);
  assert.equal(isValidSignatureStrokes([Array.from({length:501},()=>({x:0.5,y:0.5}))]), false);
});
