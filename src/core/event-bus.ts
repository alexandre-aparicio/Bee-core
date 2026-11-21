type Listener<T = unknown> = (payload: T) => void | Promise<void>;

export class BeeEventBus {
  private readonly listeners: Map<string, Set<Listener>>;

  constructor(
    private readonly namespace?: string,
    private readonly sharedEvents: ReadonlySet<string> = new Set(["bee.started"]),
    listeners?: Map<string, Set<Listener>>
  ) {
    this.listeners = listeners ?? new Map<string, Set<Listener>>();
  }

  /** Create a plugin-local event namespace while preserving system lifecycle events. */
  forPlugin(pluginName: string): BeeEventBus {
    return new BeeEventBus(pluginName.toLowerCase(), this.sharedEvents, this.listeners);
  }

  private eventKey(event: string): string {
    if (!this.namespace || this.sharedEvents.has(event)) return event;
    return `${this.namespace}:${event}`;
  }

  on<T>(event: string, listener: Listener<T>): () => void {
    const bucket = this.listeners.get(this.eventKey(event)) ?? new Set<Listener>();
    bucket.add(listener as Listener);
    this.listeners.set(this.eventKey(event), bucket);
    return () => this.off(event, listener);
  }

  off<T>(event: string, listener: Listener<T>): void {
    this.listeners.get(this.eventKey(event))?.delete(listener as Listener);
  }

  async emit<T>(event: string, payload: T): Promise<void> {
    const listeners = [...(this.listeners.get(this.eventKey(event)) ?? [])];
    await Promise.all(listeners.map(listener => listener(payload)));
  }

  listenerCount(event: string): number {
    return this.listeners.get(this.eventKey(event))?.size ?? 0;
  }
}
