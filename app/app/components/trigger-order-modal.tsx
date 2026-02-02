"use client";

import { useState, useCallback, useEffect } from "react";
import { type Position, type TriggerOrder } from "../stores/trading-store";

interface TriggerOrderModalProps {
  position: Position;
  currentPrice: number;
  onClose: () => void;
  onPlaceOrder: (params: {
    positionId: string;
    token: string;
    side: "long" | "short";
    type: "stop_loss" | "take_profit";
    triggerPrice: number;
    sizePercent: number;
  }) => Promise<TriggerOrder | null>;
  initialType?: "stop_loss" | "take_profit";
  isLoading?: boolean;
}

const SIZE_OPTIONS = [
  { label: "25%", value: 25 },
  { label: "50%", value: 50 },
  { label: "75%", value: 75 },
  { label: "100%", value: 100 },
];

export function TriggerOrderModal({
  position,
  currentPrice,
  onClose,
  onPlaceOrder,
  initialType = "stop_loss",
  isLoading = false,
}: TriggerOrderModalProps) {
  const [activeTab, setActiveTab] = useState<"stop_loss" | "take_profit">(initialType);
  const [triggerPrice, setTriggerPrice] = useState("");
  const [sizePercent, setSizePercent] = useState(100);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setTriggerPrice("");
    setValidationError(null);
  }, [activeTab]);

  const validatePrice = useCallback(
    (price: number): { valid: boolean; error: string | null } => {
      if (isNaN(price) || price <= 0) {
        return { valid: false, error: "Enter a valid price" };
      }

      const isLong = position.side === "long";

      if (activeTab === "stop_loss") {
        if (isLong) {
          if (price >= currentPrice) {
            return { valid: false, error: "SL must be below current price" };
          }
          if (price <= position.liquidationPrice) {
            return { valid: false, error: "SL must be above liquidation price" };
          }
        } else {
          if (price <= currentPrice) {
            return { valid: false, error: "SL must be above current price" };
          }
          if (price >= position.liquidationPrice) {
            return { valid: false, error: "SL must be below liquidation price" };
          }
        }
      } else {
        if (isLong) {
          if (price <= currentPrice) {
            return { valid: false, error: "TP must be above current price" };
          }
        } else {
          if (price >= currentPrice) {
            return { valid: false, error: "TP must be below current price" };
          }
        }
      }

      return { valid: true, error: null };
    },
    [activeTab, position.side, position.liquidationPrice, currentPrice]
  );

  const handlePriceChange = useCallback(
    (value: string) => {
      setTriggerPrice(value);
      const price = parseFloat(value);
      if (value && !isNaN(price)) {
        const { error } = validatePrice(price);
        setValidationError(error);
      } else {
        setValidationError(null);
      }
    },
    [validatePrice]
  );

  const handleSubmit = useCallback(async () => {
    const price = parseFloat(triggerPrice);
    const { valid, error } = validatePrice(price);

    if (!valid) {
      setValidationError(error);
      return;
    }

    const result = await onPlaceOrder({
      positionId: position.id,
      token: position.token,
      side: position.side,
      type: activeTab,
      triggerPrice: price,
      sizePercent,
    });

    if (result) {
      onClose();
    }
  }, [triggerPrice, validatePrice, onPlaceOrder, position, activeTab, sizePercent, onClose]);

  const price = parseFloat(triggerPrice);
  const isValidPrice = !isNaN(price) && price > 0 && !validationError;

  const estimatedPnl =
    isValidPrice && !isNaN(price)
      ? ((price - position.entryPrice) / position.entryPrice) *
        100 *
        position.leverage *
        (position.side === "long" ? 1 : -1)
      : null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/70"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trigger-order-title"
      >
        <div className="w-full max-w-md border-bloomberg bg-bloomberg-secondary">
          <div className="border-bottom px-4 py-3 flex items-center justify-between">
            <h2
              id="trigger-order-title"
              className="text-bloomberg-header"
            >
              SET TRIGGER ORDER
            </h2>
            <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              ×
            </button>
          </div>

          <div className="p-4">
            <div className="mb-4 flex gap-px">
              <button
                type="button"
                onClick={() => setActiveTab("stop_loss")}
                className={`flex-1 px-3 py-2 text-bloomberg-label font-semibold transition ${
                  activeTab === "stop_loss"
                    ? "border-bloomberg bg-[#2a0a0a] text-loss border-[var(--loss-red)]"
                    : "border-bloomberg bg-bloomberg-tertiary hover:text-loss"
                }`}
              >
                STOP LOSS
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("take_profit")}
                className={`flex-1 px-3 py-2 text-bloomberg-label font-semibold transition ${
                  activeTab === "take_profit"
                    ? "border-bloomberg bg-[#0a2a12] text-profit border-[var(--profit-green)]"
                    : "border-bloomberg bg-bloomberg-tertiary hover:text-profit"
                }`}
              >
                TAKE PROFIT
              </button>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-3 border-bloomberg bg-bloomberg-primary p-3 text-center">
              <div>
                <p className="text-bloomberg-label">ENTRY</p>
                <p className="text-bloomberg-value">${position.entryPrice.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-bloomberg-label">MARK</p>
                <p className="text-bloomberg-value text-accent">${currentPrice.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-bloomberg-label">LIQ</p>
                <p className={`text-bloomberg-value ${position.side === "long" ? "text-loss" : "text-profit"}`}>
                  ${position.liquidationPrice.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-2 block text-bloomberg-label">TRIGGER PRICE</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">$</span>
                <input
                  type="number"
                  value={triggerPrice}
                  onChange={(e) => handlePriceChange(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  className={`w-full bg-bloomberg-primary py-2 pl-7 pr-3 font-mono text-sm outline-none transition placeholder:text-[var(--text-muted)] ${
                    validationError
                      ? "border-bloomberg border-[var(--loss-red)]"
                      : isValidPrice
                      ? activeTab === "stop_loss"
                        ? "border-bloomberg border-[var(--loss-red)]"
                        : "border-bloomberg border-[var(--profit-green)]"
                      : "border-bloomberg focus:border-[var(--border-focus)]"
                  }`}
                />
                {isValidPrice && (
                  <span
                    className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs ${
                      activeTab === "stop_loss" ? "text-loss" : "text-profit"
                    }`}
                  >
                    ✓
                  </span>
                )}
              </div>
              {validationError && (
                <p className="mt-1 text-bloomberg-label text-loss">{validationError}</p>
              )}
              {isValidPrice && estimatedPnl !== null && (
                <p className={`mt-1 text-bloomberg-label ${estimatedPnl >= 0 ? "text-profit" : "text-loss"}`}>
                  EST. P&L: {estimatedPnl >= 0 ? "+" : ""}{estimatedPnl.toFixed(2)}%
                </p>
              )}
            </div>

            <div className="mb-6">
              <label className="mb-2 block text-bloomberg-label">SIZE</label>
              <div className="flex gap-px">
                {SIZE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSizePercent(option.value)}
                    className={`flex-1 px-2 py-1.5 text-bloomberg-label font-semibold transition ${
                      sizePercent === option.value
                        ? "border-focus-bloomberg bg-bloomberg-tertiary text-accent"
                        : "border-bloomberg bg-bloomberg-primary hover:bg-bloomberg-tertiary"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-px">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 border-bloomberg bg-bloomberg-tertiary px-4 py-2 text-bloomberg-label font-semibold transition hover:bg-[var(--border-color)]"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!isValidPrice || isLoading}
                className={`flex-1 px-4 py-2 text-bloomberg-label font-semibold transition disabled:opacity-50 ${
                  activeTab === "stop_loss"
                    ? "border-bloomberg bg-[#2a0a0a] text-loss hover:bg-[#351010]"
                    : "border-bloomberg bg-[#0a2a12] text-profit hover:bg-[#0f3518]"
                }`}
              >
                {isLoading ? "PLACING..." : "PLACE ORDER"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
