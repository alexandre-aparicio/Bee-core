import type { BeePlugin } from "../../core/types.js";

/** Minimal tenant-facing plugin proving the generic package lifecycle. */
export const helloWorldPlugin: BeePlugin = {
  manifest: { requiredServices: ["mongo"],
    name: "hello-world",
    version: "0.1.0",
    description: "Minimal example tenant plugin loaded from a signed ZIP package.",
    dependencies: ["auth", "organizations"],
    scope: "tenant",
    activationPolicy: "manual",
    frontend: { routes: [{ path: "/hello-world", component: "hello-world" }] }
  },
  initialize(ctx) {
    ctx.logger.info("Hola Mundo package initialized from the signed package runtime.");
  }
};
