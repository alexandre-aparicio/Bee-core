import type { BeePlugin } from "../core/types.js";

export const helloPlugin: BeePlugin = {
  manifest: { requiredServices: [],
    name: "hello",
    version: "0.1.0",
    description: "Example plugin that demonstrates lifecycle hooks and event bus"
  },
  initialize(ctx) {
    ctx.logger.info("Hello plugin initialized");
    ctx.events.on("bee.started", () => ctx.logger.info("Received bee.started event"));
  },
  start(ctx) {
    ctx.logger.info("Hello plugin started");
      ctx.events.emit("hello.ready", { message: "Hello from Bee-Core plugin!", timestamp: new Date().toISOString() });
  },
  stop(ctx) {
    ctx.logger.info("Hello plugin stopped");
  }
};
