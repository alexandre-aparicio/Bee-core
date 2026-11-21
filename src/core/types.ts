import type { BeeEventBus } from "./event-bus.js";
import type { FastifyInstance } from "fastify";

export type BeePluginStatus = "registered" | "initialized" | "started" | "stopped" | "failed";
export type BeeAuthClient = "backend" | "dashboard" | "public";

export interface BeeLogger {
  info(message: string, context?: unknown): void;
  warn(message: string, context?: unknown): void;
  error(message: string, context?: unknown): void;
}

export interface BeeContext {
  /** Plugin name when this context is scoped; undefined for the application context. */
  readonly pluginName?: string;
  readonly appName: string;
  readonly version: string;
  readonly events: BeeEventBus;
  readonly logger: BeeLogger;
  readonly config: Readonly<Record<string, unknown>>;
  readonly server: FastifyInstance;
}

export interface BeePlugin {
  manifest: BeePluginManifest;
  initialize?(ctx: BeeContext): Promise<void> | void;
  start?(ctx: BeeContext): Promise<void> | void;
  stop?(ctx: BeeContext): Promise<void> | void;
}

export interface BeePluginManifest {
  name: string;
  version: string;
  description?: string;
  dependencies?: string[];
  frontend?: { routes: Array<{ path: string; component: string }> };
}

export interface BeePluginInfo extends BeePluginManifest {
  status: BeePluginStatus;
}
