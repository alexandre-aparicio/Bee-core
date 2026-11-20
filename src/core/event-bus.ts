type Listener<T = unknown> = (payload: T) => void | Promise<void>;

export class BeeEventBus {
  private readonly listeners = new Map<string, Set<Listener>>();

  on<T>(event: string, listener: Listener<T>): () => void {
    const bucket = this.listeners.get(event) ?? new Set<Listener>();
    bucket.add(listener as Listener);
    this.listeners.set(event, bucket);
    return () => this.off(event, listener);
  }

  off<T>(event: string, listener: Listener<T>): void {
    this.listeners.get(event)?.delete(listener as Listener);
  }

  async emit<T>(event: string, payload: T): Promise<void> {
    const listeners = [...(this.listeners.get(event) ?? [])];
    await Promise.all(listeners.map(listener => listener(payload)));
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
