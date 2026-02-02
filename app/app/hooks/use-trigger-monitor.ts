"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { usePriceStore } from "../stores/price-store";
import { useTradingStore, type TriggerOrder } from "../stores/trading-store";
import {
  type TriggerMatch,
  type MonitorState,
  MAX_TRIGGERS_PER_BATCH,
  MONITOR_INTERVAL_MS,
  PRICE_STALENESS_MS,
  shouldTrigger,
  inferTriggerCondition,
} from "../types/trigger-monitor";

export interface UseTriggerMonitorReturn {
  monitorState: MonitorState;
  startMonitoring: () => void;
  stopMonitoring: () => void;
  processMatchedTriggers: () => Promise<TriggerMatch[]>;
  clearMatches: () => void;
}

export function filterMonitorableOrders(orders: TriggerOrder[]): TriggerOrder[] {
  return orders.filter((o) => o.status === "active" && o.source !== "drift");
}

export function useTriggerMonitor(): UseTriggerMonitorReturn {
  const prices = usePriceStore((state) => state.prices);
  const lastUpdated = usePriceStore((state) => state.lastUpdated);
  const triggerOrders = useTradingStore((state) => state.triggerOrders);
  const updateTriggerOrderStatus = useTradingStore((state) => state.updateTriggerOrderStatus);

  const [monitorState, setMonitorState] = useState<MonitorState>({
    isRunning: false,
    lastCheck: null,
    activeOrders: 0,
    matchedOrders: [],
    errors: [],
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const previousPricesRef = useRef<Record<string, number>>({});

  const checkTriggers = useCallback(() => {
    const now = Date.now();
    const activeOrders = filterMonitorableOrders(triggerOrders);
    const matches: TriggerMatch[] = [];
    const errors: string[] = [];

    for (const order of activeOrders) {
      const currentPrice = prices[order.token];
      const priceLastUpdated = lastUpdated[order.token];

      if (!currentPrice) {
        errors.push(`No price data for ${order.token}`);
        continue;
      }

      if (priceLastUpdated && now - priceLastUpdated > PRICE_STALENESS_MS) {
        errors.push(`Stale price for ${order.token} (${now - priceLastUpdated}ms old)`);
        continue;
      }

      const condition = inferTriggerCondition(
        order.type,
        order.side,
        order.triggerPrice,
        currentPrice
      );

      const previousPrice = previousPricesRef.current[order.token];

      if (shouldTrigger(currentPrice, order.triggerPrice, condition, previousPrice)) {
        matches.push({
          orderId: order.id,
          currentPrice,
          triggerPrice: order.triggerPrice,
          condition,
          matchedAt: now,
        });

        if (matches.length >= MAX_TRIGGERS_PER_BATCH) {
          break;
        }
      }
    }

    previousPricesRef.current = { ...prices };

    setMonitorState(prev => ({
      ...prev,
      lastCheck: now,
      activeOrders: activeOrders.length,
      matchedOrders: [...prev.matchedOrders, ...matches],
      errors: errors.slice(-10),
    }));

    return matches;
  }, [triggerOrders, prices, lastUpdated]);

  const startMonitoring = useCallback(() => {
    if (intervalRef.current) return;

    console.log("[TriggerMonitor] Starting monitoring at", MONITOR_INTERVAL_MS, "ms intervals");

    setMonitorState(prev => ({ ...prev, isRunning: true, errors: [] }));

    intervalRef.current = setInterval(() => {
      checkTriggers();
    }, MONITOR_INTERVAL_MS);

    checkTriggers();
  }, [checkTriggers]);

  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setMonitorState(prev => ({ ...prev, isRunning: false }));
    console.log("[TriggerMonitor] Monitoring stopped");
  }, []);

  const processMatchedTriggers = useCallback(async (): Promise<TriggerMatch[]> => {
    const toProcess = monitorState.matchedOrders.slice(0, MAX_TRIGGERS_PER_BATCH);

    for (const match of toProcess) {
      updateTriggerOrderStatus(match.orderId, "triggered");
    }

    setMonitorState(prev => ({
      ...prev,
      matchedOrders: prev.matchedOrders.slice(MAX_TRIGGERS_PER_BATCH),
    }));

    return toProcess;
  }, [monitorState.matchedOrders, updateTriggerOrderStatus]);

  const clearMatches = useCallback(() => {
    setMonitorState(prev => ({ ...prev, matchedOrders: [] }));
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    monitorState,
    startMonitoring,
    stopMonitoring,
    processMatchedTriggers,
    clearMatches,
  };
}
