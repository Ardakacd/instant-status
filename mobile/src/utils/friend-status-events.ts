/**
 * In-app signal when friend status changed (e.g. foreground FCM).
 * Uses JS-only listeners — avoids DeviceEventEmitter quirks on some Android/RN builds.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

export function emitFriendStatusUpdated(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore listener errors */
    }
  });
}

export function subscribeFriendStatusUpdated(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
