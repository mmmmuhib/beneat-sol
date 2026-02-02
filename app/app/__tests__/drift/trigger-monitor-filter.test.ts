import { describe, expect, it } from "vitest";

import { filterMonitorableOrders } from "../../hooks/use-trigger-monitor";
import type { TriggerOrder } from "../../stores/trading-store";

describe("filterMonitorableOrders", () => {
  const base: Omit<TriggerOrder, "id"> = {
    positionId: "pos-1",
    token: "SOL",
    side: "long",
    type: "stop_loss",
    triggerPrice: 100,
    sizeAmount: "1",
    status: "active",
    timestamp: Date.now(),
  };

  it("skips orders with source: drift", () => {
    const orders: TriggerOrder[] = [
      { ...base, id: "a", source: "drift" },
      { ...base, id: "b", source: "ghost" },
    ];

    const result = filterMonitorableOrders(orders);
    expect(result.map((o) => o.id)).toEqual(["b"]);
  });

  it("includes orders with source: ghost", () => {
    const orders: TriggerOrder[] = [{ ...base, id: "a", source: "ghost" }];
    const result = filterMonitorableOrders(orders);
    expect(result).toHaveLength(1);
  });

  it("includes orders with source: undefined (legacy)", () => {
    const orders: TriggerOrder[] = [{ ...base, id: "a" }];
    const result = filterMonitorableOrders(orders);
    expect(result).toHaveLength(1);
  });
});
