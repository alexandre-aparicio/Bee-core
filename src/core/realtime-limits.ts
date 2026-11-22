import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";

type TicketEntry<T> = { ticket: string; value: T; expiresAt: number };
type HeapEntry = { ticket: string; expiresAt: number };

/**
 * Bounded, single-use ticket storage. Expiration is maintained by an indexed
 * min-heap, so cleanup is O(k log n) for k expired tickets instead of scanning
 * every live Map entry on each request.
 */
export class BoundedTicketStore<T> {
  private readonly records = new Map<string, TicketEntry<T>>();
  private readonly heap: HeapEntry[] = [];
  private readonly positions = new Map<string, number>();

  constructor(
    readonly maxEntries = 5_000,
    readonly ttlMs = 30_000,
    private readonly now: () => number = () => performance.now()
  ) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new Error("maxEntries must be a positive safe integer");
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1) throw new Error("ttlMs must be a positive safe integer");
  }

  get size(): number {
    this.pruneExpired();
    return this.records.size;
  }

  issue(value: T): { ticket: string; expiresIn: number } | null {
    this.pruneExpired();
    if (this.records.size >= this.maxEntries) return null;

    let ticket = randomBytes(32).toString("base64url");
    while (this.records.has(ticket)) ticket = randomBytes(32).toString("base64url");
    const expiresAt = this.now() + this.ttlMs;
    this.records.set(ticket, { ticket, value, expiresAt });
    this.push({ ticket, expiresAt });
    return { ticket, expiresIn: Math.ceil(this.ttlMs / 1_000) };
  }

  consume(ticket: string): T | null {
    this.pruneExpired();
    const entry = this.records.get(ticket);
    if (!entry) return null;
    this.remove(ticket);
    return entry.value;
  }

  clear(): void {
    this.records.clear();
    this.heap.length = 0;
    this.positions.clear();
  }

  private pruneExpired(): void {
    const now = this.now();
    while (this.heap[0] && this.heap[0].expiresAt <= now) this.remove(this.heap[0].ticket);
  }

  private push(entry: HeapEntry): void {
    const index = this.heap.length;
    this.heap.push(entry);
    this.positions.set(entry.ticket, index);
    this.siftUp(index);
  }

  private remove(ticket: string): void {
    const index = this.positions.get(ticket);
    if (index === undefined) return;
    this.records.delete(ticket);
    this.positions.delete(ticket);
    const last = this.heap.pop();
    if (!last || index >= this.heap.length) return;
    this.heap[index] = last;
    this.positions.set(last.ticket, index);
    const parent = Math.floor((index - 1) / 2);
    if (index > 0 && this.heap[index].expiresAt < this.heap[parent].expiresAt) this.siftUp(index);
    else this.siftDown(index);
  }

  private siftUp(start: number): void {
    let index = start;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.heap[parent].expiresAt <= this.heap[index].expiresAt) break;
      this.swap(parent, index);
      index = parent;
    }
  }

  private siftDown(start: number): void {
    let index = start;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < this.heap.length && this.heap[left].expiresAt < this.heap[smallest].expiresAt) smallest = left;
      if (right < this.heap.length && this.heap[right].expiresAt < this.heap[smallest].expiresAt) smallest = right;
      if (smallest === index) return;
      this.swap(index, smallest);
      index = smallest;
    }
  }

  private swap(left: number, right: number): void {
    const a = this.heap[left];
    const b = this.heap[right];
    this.heap[left] = b;
    this.heap[right] = a;
    this.positions.set(a.ticket, right);
    this.positions.set(b.ticket, left);
  }
}

/** O(1) per-connection accounting for IP and authenticated-user quotas. */
export class RealtimeConnectionLimiter {
  private readonly byIp = new Map<string, number>();
  private readonly byUser = new Map<string, number>();

  constructor(readonly perIpLimit = 20, readonly perUserLimit = 5) {
    if (!Number.isSafeInteger(perIpLimit) || perIpLimit < 1) throw new Error("perIpLimit must be a positive safe integer");
    if (!Number.isSafeInteger(perUserLimit) || perUserLimit < 1) throw new Error("perUserLimit must be a positive safe integer");
  }

  tryAcquire(ip: string, userId?: string): (() => void) | null {
    const ipKey = ip.trim() || "unknown";
    const userKey = userId?.trim();
    if ((this.byIp.get(ipKey) ?? 0) >= this.perIpLimit) return null;
    if (userKey && (this.byUser.get(userKey) ?? 0) >= this.perUserLimit) return null;

    this.byIp.set(ipKey, (this.byIp.get(ipKey) ?? 0) + 1);
    if (userKey) this.byUser.set(userKey, (this.byUser.get(userKey) ?? 0) + 1);

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.decrement(this.byIp, ipKey);
      if (userKey) this.decrement(this.byUser, userKey);
    };
  }

  private decrement(counter: Map<string, number>, key: string): void {
    const next = (counter.get(key) ?? 0) - 1;
    if (next > 0) counter.set(key, next);
    else counter.delete(key);
  }
}
