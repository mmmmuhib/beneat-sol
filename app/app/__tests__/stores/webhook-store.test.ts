import { describe, it, expect, beforeEach } from "vitest";
import { useWebhookStore } from "../../stores/webhook-store";

describe("webhookStore", () => {
  beforeEach(() => {
    useWebhookStore.getState().reset();
  });

  it("processes lockout event", () => {
    useWebhookStore.getState().processWebhookEvent({
      type: "LOCKOUT_TRIGGERED",
      signature: "test-sig",
      timestamp: Date.now(),
      data: { reason: "max_loss_exceeded" },
    });

    const state = useWebhookStore.getState();
    expect(state.isLocked).toBe(true);
    expect(state.lastEvent?.type).toBe("LOCKOUT_TRIGGERED");
    expect(state.events).toHaveLength(1);
  });

  it("clears lockout on clearance event", () => {
    const store = useWebhookStore.getState();

    store.processWebhookEvent({
      type: "LOCKOUT_TRIGGERED",
      signature: "lock-sig",
      timestamp: Date.now() - 1000,
      data: {},
    });

    store.processWebhookEvent({
      type: "LOCKOUT_CLEARED",
      signature: "clear-sig",
      timestamp: Date.now(),
      data: {},
    });

    expect(store.isLocked).toBe(false);
  });

  it("maintains event history up to max limit", () => {
    const store = useWebhookStore.getState();

    for (let i = 0; i < 60; i++) {
      store.processWebhookEvent({
        type: "TRADE",
        signature: `sig-${i}`,
        timestamp: Date.now() + i,
        data: {},
      });
    }

    expect(store.events.length).toBeLessThanOrEqual(50);
  });
});
