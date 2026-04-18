import { EventEmitter } from "events";
import type { ObsEventMap } from "../gateway/modules/obs/types.js";
import type { SessionManifestEventMap } from "../gateway/modules/sessionManifest/types.js";

// EventMap is composed from each module's slice.
// To add events for a new module: create a types.ts in its folder and intersect here.
export interface EventMap extends ObsEventMap, SessionManifestEventMap {}

// ---- EventBus ----

class EventBusImpl {
  private readonly emitter = new EventEmitter();

  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    this.emitter.emit(event, payload);
  }

  subscribe<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void): void {
    this.emitter.on(event, handler);
  }

  unsubscribe<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void): void {
    this.emitter.off(event, handler);
  }
}

// Singleton — all services share the same bus instance.
export const eventBus = new EventBusImpl();
