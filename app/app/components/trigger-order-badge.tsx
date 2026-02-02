"use client";

import { type TriggerOrder } from "../stores/trading-store";

interface TriggerOrderBadgeProps {
  order: TriggerOrder;
  onEdit: () => void;
  onCancel: () => void;
  disabled?: boolean;
}

export function TriggerOrderBadge({
  order,
  onEdit,
  onCancel,
  disabled = false,
}: TriggerOrderBadgeProps) {
  const isStopLoss = order.type === "stop_loss";
  const label = isStopLoss ? "SL" : "TP";

  return (
    <div
      className={`inline-flex items-center gap-1.5 border-bloomberg px-2 py-0.5 ${
        isStopLoss ? "bg-[#1a0505]" : "bg-[#051a0a]"
      }`}
    >
      <button
        type="button"
        onClick={onEdit}
        disabled={disabled}
        className={`text-bloomberg-label font-mono transition hover:underline disabled:opacity-50 ${
          isStopLoss ? "text-loss" : "text-profit"
        }`}
      >
        {label} ${order.triggerPrice.toFixed(2)}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onCancel();
        }}
        disabled={disabled}
        className={`text-bloomberg-label transition disabled:opacity-50 ${
          isStopLoss
            ? "text-[var(--text-muted)] hover:text-loss"
            : "text-[var(--text-muted)] hover:text-profit"
        }`}
        aria-label={`Cancel ${isStopLoss ? "stop loss" : "take profit"} order`}
      >
        ×
      </button>
    </div>
  );
}
