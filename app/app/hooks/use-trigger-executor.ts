"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useDrift } from "./use-drift";
import { useTriggerMonitor } from "./use-trigger-monitor";
import { useTradingStore } from "../stores/trading-store";
import { useDevMode } from "./use-dev-mode";
import { useDemoMode } from "./use-demo-mode";
import type { TriggerMatch } from "../types/trigger-monitor";

export interface ExecutionResult {
  orderId: string;
  success: boolean;
  signature?: string;
  error?: string;
  executedAt: number;
}

export interface UseTriggerExecutorReturn {
  isExecuting: boolean;
  lastExecution: ExecutionResult[] | null;
  executionHistory: ExecutionResult[];
  executeTriggeredOrders: () => Promise<ExecutionResult[]>;
  autoExecuteEnabled: boolean;
  enableAutoExecute: () => void;
  disableAutoExecute: () => void;
}

export function useTriggerExecutor(): UseTriggerExecutorReturn {
  const { isDevMode } = useDevMode();
  const { isDemoMode } = useDemoMode();
  const { closePosition } = useDrift();
  const { monitorState, processMatchedTriggers, startMonitoring, stopMonitoring } = useTriggerMonitor();
  const triggerOrders = useTradingStore((state) => state.triggerOrders);
  const positions = useTradingStore((state) => state.positions);
  const updateTriggerOrderStatus = useTradingStore((state) => state.updateTriggerOrderStatus);
  const removePosition = useTradingStore((state) => state.removePosition);

  const [isExecuting, setIsExecuting] = useState(false);
  const [lastExecution, setLastExecution] = useState<ExecutionResult[] | null>(null);
  const [executionHistory, setExecutionHistory] = useState<ExecutionResult[]>([]);
  const [autoExecuteEnabled, setAutoExecuteEnabled] = useState(false);
  const autoExecuteRef = useRef(false);

  const executeTriggeredOrders = useCallback(async (): Promise<ExecutionResult[]> => {
    const matches = await processMatchedTriggers();

    if (matches.length === 0) {
      return [];
    }

    setIsExecuting(true);
    const results: ExecutionResult[] = [];

    for (const match of matches) {
      const order = triggerOrders.find(o => o.id === match.orderId);
      if (!order) {
        results.push({
          orderId: match.orderId,
          success: false,
          error: "Order not found",
          executedAt: Date.now(),
        });
        continue;
      }

      const position = positions.find(p => p.id === order.positionId);
      if (!position) {
        results.push({
          orderId: match.orderId,
          success: false,
          error: "Position not found",
          executedAt: Date.now(),
        });
        continue;
      }

      try {
        console.log(`[TriggerExecutor] Executing ${order.type} for position ${position.id}`);
        console.log(`[TriggerExecutor] Trigger: ${order.triggerPrice}, Current: ${match.currentPrice}`);

        if (isDevMode || isDemoMode) {
          await new Promise(resolve => setTimeout(resolve, 500));
          results.push({
            orderId: match.orderId,
            success: true,
            signature: `trigger-exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            executedAt: Date.now(),
          });
          removePosition(position.id);
        } else {
          const closeResult = await closePosition({
            positionId: position.id,
            token: position.token,
            side: position.side,
          });

          if (closeResult.success) {
            results.push({
              orderId: match.orderId,
              success: true,
              signature: closeResult.signature,
              executedAt: Date.now(),
            });
          } else {
            results.push({
              orderId: match.orderId,
              success: false,
              error: closeResult.error,
              executedAt: Date.now(),
            });
            updateTriggerOrderStatus(match.orderId, "active");
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Execution failed";
        results.push({
          orderId: match.orderId,
          success: false,
          error: message,
          executedAt: Date.now(),
        });
        updateTriggerOrderStatus(match.orderId, "active");
      }
    }

    setIsExecuting(false);
    setLastExecution(results);
    setExecutionHistory(prev => [...prev, ...results].slice(-100));

    return results;
  }, [
    processMatchedTriggers,
    triggerOrders,
    positions,
    isDevMode,
    closePosition,
    removePosition,
    updateTriggerOrderStatus,
  ]);

  useEffect(() => {
    if (!autoExecuteEnabled || monitorState.matchedOrders.length === 0) {
      return;
    }

    if (autoExecuteRef.current) {
      return;
    }

    autoExecuteRef.current = true;
    executeTriggeredOrders().finally(() => {
      autoExecuteRef.current = false;
    });
  }, [autoExecuteEnabled, monitorState.matchedOrders.length, executeTriggeredOrders]);

  const enableAutoExecute = useCallback(() => {
    setAutoExecuteEnabled(true);
    startMonitoring();
    console.log("[TriggerExecutor] Auto-execute enabled");
  }, [startMonitoring]);

  const disableAutoExecute = useCallback(() => {
    setAutoExecuteEnabled(false);
    stopMonitoring();
    console.log("[TriggerExecutor] Auto-execute disabled");
  }, [stopMonitoring]);

  return {
    isExecuting,
    lastExecution,
    executionHistory,
    executeTriggeredOrders,
    autoExecuteEnabled,
    enableAutoExecute,
    disableAutoExecute,
  };
}
