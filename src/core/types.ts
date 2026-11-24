import type { BeeEventBus } from "./event-bus.js";
import type { FastifyInstance } from "fastify";
import type { MongoClient } from "mongodb";

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
  /** One process-wide MongoDB client shared by every plugin scope. */
  readonly mongoClient: MongoClient;
}

export interface BeePlugin {
  manifest: BeePluginManifest;
  initialize?(ctx: BeeContext): Promise<void> | void;
  start?(ctx: BeeContext): Promise<void> | void;
  stop?(ctx: BeeContext): Promise<void> | void;
}

export type BeePluginActivationPolicy = "automatic" | "manual";

export interface BeePluginManifest {
  /** Stable package identifier; case-insensitive and globally unique. */
  name: string;
  version: string;
  description?: string;
  /** Runtime dependencies, resolved before this plugin is initialized. */
  dependencies?: string[];
  /** Tenant-facing plugins default to manual activation unless explicitly configured. */
  activationPolicy?: BeePluginActivationPolicy;
  /** All three business modules are tenant-scoped; platform services use platform. */
  scope?: "platform" | "tenant";
  frontend?: { routes: Array<{ path: string; component: string }> };
}

export interface BeePluginInfo extends BeePluginManifest {
  status: BeePluginStatus;
  error?: string;
}
