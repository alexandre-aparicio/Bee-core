import { test } from "node:test";
import assert from "node:assert/strict";
import { isExternalRuntimePackage } from "../src/core/plugin-runtime-classification.js";

test("core plugin registered in memory is not classified as an external ZIP runtime", () => {
  // Reproduces the production regression: files is in the runtime registry,
  // but there is no installed platform ZIP for it.
  assert.equal(isExternalRuntimePackage("files", null, false), false);
});

test("trusted built-in packages are never exposed as external ZIP runtimes", () => {
  assert.equal(isExternalRuntimePackage("notes", {
    pluginId: "notes", status: "installed", source: "zip"
  }, true), false);
});

test("legacy non-ZIP runtime records are not exposed as external runtimes", () => {
  assert.equal(isExternalRuntimePackage("files", {
    pluginId: "files", status: "installed", source: "builtin"
  }, false), false);
});

test("an installed ZIP package is classified as external", () => {
  assert.equal(isExternalRuntimePackage("documents", {
    pluginId: "documents", status: "installed", source: "zip"
  }, false), true);
});

test("available, uninstalling, or mismatched package records are not external installed runtimes", () => {
  assert.equal(isExternalRuntimePackage("documents", {
    pluginId: "documents", status: "available", source: "zip"
  }, false), false);
  assert.equal(isExternalRuntimePackage("documents", {
    pluginId: "other", status: "installed", source: "zip"
  }, false), false);
});
