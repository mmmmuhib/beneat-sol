"use client";

import { useTriggerMonitor } from "../hooks/use-trigger-monitor";
import { useTriggerExecutor } from "../hooks/use-trigger-executor";
import { usePriceStore } from "../stores/price-store";
import { useTradingStore } from "../stores/trading-store";

export function TriggerMonitorStatus() {
  const { monitorState } = useTriggerMonitor();
  const {
    isExecuting,
    autoExecuteEnabled,
    enableAutoExecute,
    disableAutoExecute,
    executeTriggeredOrders,
    executionHistory,
  } = useTriggerExecutor();
  const connectionStatus = usePriceStore((state) => state.connectionStatus);
  const triggerOrders = useTradingStore((state) => state.triggerOrders);

  const hasGhostTriggers = triggerOrders.some(
    (o) => o.status === "active" && o.source !== "drift"
  );

  const statusColor = monitorState.isRunning
    ? "text-accent"
    : "text-bloomberg-label";

  const priceStatusColor = connectionStatus === "connected"
    ? "text-accent"
    : connectionStatus === "reconnecting"
    ? "text-accent"
    : "text-loss";

  if (!hasGhostTriggers) {
    return (
      <div className="border-bloomberg bg-bloomberg-secondary p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-primary)]">
            Trigger Monitor
          </h3>
          <span className="text-[10px] uppercase tracking-wider text-bloomberg-label">
            NO GHOST TRIGGERS
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="border-bloomberg bg-bloomberg-secondary p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-primary)]">
          Trigger Monitor
        </h3>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] uppercase tracking-wider ${statusColor}`}>
            {monitorState.isRunning ? "● ACTIVE" : "○ INACTIVE"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-[10px] uppercase tracking-wider">
        <div>
          <span className="text-[var(--text-muted)]">Price Feed:</span>
          <span className={`ml-2 ${priceStatusColor}`}>
            {connectionStatus}
          </span>
        </div>
        <div>
          <span className="text-[var(--text-muted)]">Active Orders:</span>
          <span className="ml-2 text-[var(--text-primary)]">
            {monitorState.activeOrders}
          </span>
        </div>
        <div>
          <span className="text-[var(--text-muted)]">Pending:</span>
          <span className="ml-2 text-accent">
            {monitorState.matchedOrders.length}
          </span>
        </div>
        <div>
          <span className="text-[var(--text-muted)]">Last Check:</span>
          <span className="ml-2 text-[var(--text-primary)]">
            {monitorState.lastCheck
              ? `${Math.floor((Date.now() - monitorState.lastCheck) / 1000)}s`
              : "—"
            }
          </span>
        </div>
      </div>

      {monitorState.errors.length > 0 && (
        <div className="text-[10px] uppercase tracking-wider text-loss bg-[#1a0505] p-2 border border-[var(--loss-red)]">
          {monitorState.errors[monitorState.errors.length - 1]}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={autoExecuteEnabled ? disableAutoExecute : enableAutoExecute}
          className={`flex-1 px-3 py-2 text-[10px] uppercase tracking-wider font-semibold transition-all ${
            autoExecuteEnabled
              ? "border border-[var(--loss-red)] bg-[#2a0a0a] text-loss hover:bg-[#351010]"
              : "border-bloomberg bg-bloomberg-tertiary text-accent hover:bg-[var(--border-color)]"
          }`}
        >
          {autoExecuteEnabled ? "Disable Auto" : "Enable Auto"}
        </button>

        {monitorState.matchedOrders.length > 0 && (
          <button
            onClick={() => executeTriggeredOrders()}
            disabled={isExecuting}
            className="px-3 py-2 border border-[var(--accent-orange)] bg-bloomberg-tertiary text-accent hover:bg-[var(--border-color)] disabled:opacity-50 text-[10px] uppercase tracking-wider font-semibold transition-all"
          >
            {isExecuting ? "Executing..." : `Execute (${monitorState.matchedOrders.length})`}
          </button>
        )}
      </div>

      {executionHistory.length > 0 && (
        <div className="border-t border-[var(--border-color)] pt-2">
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            Recent Executions:
          </span>
          <div className="mt-1 space-y-1 max-h-16 overflow-y-auto">
            {executionHistory.slice(-3).map((result, i) => (
              <div
                key={`${result.orderId}-${i}`}
                className={`text-[10px] uppercase tracking-wider ${result.success ? "text-accent" : "text-loss"}`}
              >
                {result.success ? "✓" : "✗"} {result.orderId.slice(0, 8)}...
                {result.error && <span className="text-[var(--text-muted)] ml-1">({result.error})</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
