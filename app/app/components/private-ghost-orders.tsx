"use client";

import { useState, useMemo, useCallback } from "react";
import { usePrivateGhostOrders } from "../hooks/use-private-ghost-orders";
import { usePriceStore } from "../stores/price-store";

const MARKET_OPTIONS = [
  { value: 0, label: "SOL-PERP", feedId: "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d" },
  { value: 1, label: "BTC-PERP", feedId: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43" },
  { value: 2, label: "ETH-PERP", feedId: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace" },
];

const EXPIRY_OPTIONS = [
  { value: 3600, label: "1 hour" },
  { value: 14400, label: "4 hours" },
  { value: 86400, label: "24 hours" },
  { value: 604800, label: "7 days" },
  { value: 0, label: "No expiry" },
];

interface PrivateGhostOrdersProps {
  className?: string;
}

export function PrivateGhostOrders({ className = "" }: PrivateGhostOrdersProps) {
  const {
    executorState,
    orders,
    isLoading,
    isInitialized,
    isDelegated,
    error,
    initializeExecutor,
    delegateExecutor,
    undelegateExecutor,
    createPrivateOrder,
    refreshExecutorState,
  } = usePrivateGhostOrders();

  const { getPrice } = usePriceStore();

  const [marketIndex, setMarketIndex] = useState(0);
  const [triggerPrice, setTriggerPrice] = useState("");
  const [triggerCondition, setTriggerCondition] = useState<"above" | "below">("below");
  const [orderSide, setOrderSide] = useState<"long" | "short">("short");
  const [size, setSize] = useState("");
  const [reduceOnly, setReduceOnly] = useState(true);
  const [expirySeconds, setExpirySeconds] = useState(86400);
  const [showOrderForm, setShowOrderForm] = useState(false);

  const selectedMarket = MARKET_OPTIONS.find(m => m.value === marketIndex) || MARKET_OPTIONS[0];
  const currentPrice = getPrice(selectedMarket.label.replace("-PERP", "")) || 0;

  const triggerPriceNum = parseFloat(triggerPrice) || 0;
  const sizeNum = parseFloat(size) || 0;

  const priceValidation = useMemo(() => {
    if (!triggerPrice || triggerPriceNum <= 0) {
      return { valid: false, error: null };
    }

    if (orderSide === "long" && triggerCondition === "below") {
      if (triggerPriceNum >= currentPrice) {
        return { valid: false, error: "Buy trigger must be below current price" };
      }
    } else if (orderSide === "short" && triggerCondition === "above") {
      if (triggerPriceNum <= currentPrice) {
        return { valid: false, error: "Sell trigger must be above current price" };
      }
    }

    return { valid: true, error: null };
  }, [triggerPrice, triggerPriceNum, triggerCondition, orderSide, currentPrice]);

  const handleCreateOrder = useCallback(async () => {
    if (!priceValidation.valid || sizeNum <= 0) return;

    const scaledPrice = Math.floor(triggerPriceNum * 1e6).toString();
    const scaledSize = Math.floor(sizeNum * 1e6).toString();

    await createPrivateOrder({
      marketIndex,
      triggerPrice: scaledPrice,
      triggerCondition,
      orderSide,
      baseAssetAmount: scaledSize,
      reduceOnly,
      expirySeconds,
      feedId: selectedMarket.feedId,
    });

    setTriggerPrice("");
    setSize("");
    setShowOrderForm(false);
  }, [
    createPrivateOrder,
    marketIndex,
    triggerPriceNum,
    triggerCondition,
    orderSide,
    sizeNum,
    reduceOnly,
    expirySeconds,
    selectedMarket.feedId,
    priceValidation.valid,
  ]);

  if (!isInitialized) {
    return (
      <div className={`border-bloomberg bg-bloomberg-secondary p-6 ${className}`}>
        <h3 className="text-bloomberg-header mb-4">PRIVATE GHOST ORDERS</h3>
        <p className="text-bloomberg-label text-muted mb-4">
          Initialize your executor to create hidden orders that are invisible on-chain until triggered.
        </p>
        <button
          onClick={initializeExecutor}
          disabled={isLoading}
          className="w-full border-bloomberg bg-bloomberg-tertiary px-4 py-3 text-bloomberg-label text-accent hover:bg-bloomberg-secondary disabled:opacity-50"
        >
          {isLoading ? "INITIALIZING..." : "INITIALIZE EXECUTOR"}
        </button>
        {error && (
          <p className="mt-3 text-bloomberg-label text-red-500">{error}</p>
        )}
      </div>
    );
  }

  if (!isDelegated) {
    return (
      <div className={`border-bloomberg bg-bloomberg-secondary p-6 ${className}`}>
        <h3 className="text-bloomberg-header mb-4">PRIVATE GHOST ORDERS</h3>
        <div className="mb-4 border-bloomberg bg-bloomberg-tertiary p-3">
          <div className="flex items-center justify-between">
            <span className="text-bloomberg-label text-muted">Executor Status</span>
            <span className="text-bloomberg-label text-yellow-500">● NOT DELEGATED</span>
          </div>
          <p className="mt-2 text-xs text-muted">
            Delegate your executor to MagicBlock TEE to enable automatic order execution.
          </p>
        </div>
        <button
          onClick={delegateExecutor}
          disabled={isLoading}
          className="w-full border-bloomberg bg-accent px-4 py-3 text-bloomberg-label text-black hover:bg-accent/80 disabled:opacity-50"
        >
          {isLoading ? "DELEGATING..." : "DELEGATE TO TEE"}
        </button>
        {error && (
          <p className="mt-3 text-bloomberg-label text-red-500">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className={`border-bloomberg bg-bloomberg-secondary ${className}`}>
      <div className="flex items-center justify-between border-b border-bloomberg-border p-4">
        <h3 className="text-bloomberg-header">PRIVATE GHOST ORDERS</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-green-500">● DELEGATED</span>
          <button
            onClick={() => setShowOrderForm(!showOrderForm)}
            className="border-bloomberg bg-bloomberg-tertiary px-3 py-1 text-xs text-accent hover:bg-bloomberg-secondary"
          >
            {showOrderForm ? "HIDE FORM" : "+ NEW ORDER"}
          </button>
        </div>
      </div>

      {showOrderForm && (
        <div className="border-b border-bloomberg-border p-4">
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted mb-1 block">MARKET</label>
                <select
                  value={marketIndex}
                  onChange={(e) => setMarketIndex(parseInt(e.target.value))}
                  className="w-full border-bloomberg bg-bloomberg-tertiary px-3 py-2 text-sm text-primary"
                >
                  {MARKET_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">EXPIRY</label>
                <select
                  value={expirySeconds}
                  onChange={(e) => setExpirySeconds(parseInt(e.target.value))}
                  className="w-full border-bloomberg bg-bloomberg-tertiary px-3 py-2 text-sm text-primary"
                >
                  {EXPIRY_OPTIONS.map((e) => (
                    <option key={e.value} value={e.value}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted mb-1 block">TRIGGER CONDITION</label>
                <div className="flex">
                  <button
                    onClick={() => setTriggerCondition("below")}
                    className={`flex-1 border-bloomberg px-3 py-2 text-xs ${
                      triggerCondition === "below"
                        ? "bg-accent text-black"
                        : "bg-bloomberg-tertiary text-muted"
                    }`}
                  >
                    BELOW
                  </button>
                  <button
                    onClick={() => setTriggerCondition("above")}
                    className={`flex-1 border-bloomberg px-3 py-2 text-xs ${
                      triggerCondition === "above"
                        ? "bg-accent text-black"
                        : "bg-bloomberg-tertiary text-muted"
                    }`}
                  >
                    ABOVE
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">ORDER SIDE</label>
                <div className="flex">
                  <button
                    onClick={() => setOrderSide("long")}
                    className={`flex-1 border-bloomberg px-3 py-2 text-xs ${
                      orderSide === "long"
                        ? "bg-green-600 text-white"
                        : "bg-bloomberg-tertiary text-muted"
                    }`}
                  >
                    LONG
                  </button>
                  <button
                    onClick={() => setOrderSide("short")}
                    className={`flex-1 border-bloomberg px-3 py-2 text-xs ${
                      orderSide === "short"
                        ? "bg-red-600 text-white"
                        : "bg-bloomberg-tertiary text-muted"
                    }`}
                  >
                    SHORT
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted mb-1 block">
                  TRIGGER PRICE
                  {currentPrice > 0 && (
                    <span className="ml-2 text-accent">
                      (Current: ${currentPrice.toFixed(2)})
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  value={triggerPrice}
                  onChange={(e) => setTriggerPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full border-bloomberg bg-bloomberg-tertiary px-3 py-2 text-sm text-primary"
                />
                {priceValidation.error && (
                  <p className="mt-1 text-xs text-red-500">{priceValidation.error}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">SIZE (SOL)</label>
                <input
                  type="number"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  placeholder="0.00"
                  className="w-full border-bloomberg bg-bloomberg-tertiary px-3 py-2 text-sm text-primary"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="reduceOnly"
                checked={reduceOnly}
                onChange={(e) => setReduceOnly(e.target.checked)}
                className="h-4 w-4"
              />
              <label htmlFor="reduceOnly" className="text-xs text-muted">
                REDUCE ONLY (close existing position)
              </label>
            </div>

            <div className="border-bloomberg bg-bloomberg-tertiary p-3">
              <div className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 text-accent"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                <span className="text-xs text-muted">
                  Order will be encrypted and hidden on-chain until triggered
                </span>
              </div>
            </div>

            <button
              onClick={handleCreateOrder}
              disabled={isLoading || !priceValidation.valid || sizeNum <= 0}
              className="w-full border-bloomberg bg-accent px-4 py-3 text-bloomberg-label text-black hover:bg-accent/80 disabled:opacity-50"
            >
              {isLoading ? "CREATING..." : "CREATE PRIVATE ORDER"}
            </button>
          </div>
        </div>
      )}

      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs text-muted">
            ACTIVE ORDERS ({executorState?.orderHashCount || 0}/16)
          </span>
          <button
            onClick={refreshExecutorState}
            className="text-xs text-accent hover:underline"
          >
            REFRESH
          </button>
        </div>

        {orders.length === 0 ? (
          <div className="border-bloomberg bg-bloomberg-tertiary p-4 text-center">
            <p className="text-xs text-muted">No active private orders</p>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => (
              <div
                key={order.orderId}
                className="border-bloomberg bg-bloomberg-tertiary p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-bold ${
                        order.orderSide === "long" ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {order.orderSide.toUpperCase()}
                    </span>
                    <span className="text-xs text-primary">
                      {MARKET_OPTIONS.find(m => m.value === order.marketIndex)?.label || "UNKNOWN"}
                    </span>
                  </div>
                  <span
                    className={`text-xs ${
                      order.status === "active"
                        ? "text-green-500"
                        : order.status === "executed"
                        ? "text-blue-500"
                        : "text-muted"
                    }`}
                  >
                    {order.status.toUpperCase()}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted">
                  <div>
                    Trigger: {order.triggerCondition} $
                    {(parseInt(order.triggerPrice) / 1e6).toFixed(2)}
                  </div>
                  <div>
                    Size: {(parseInt(order.baseAssetAmount) / 1e6).toFixed(4)} SOL
                  </div>
                </div>
                <div className="mt-1 text-xs text-muted truncate">
                  Hash: {order.orderHash.slice(0, 16)}...
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="border-t border-bloomberg-border p-4">
          <p className="text-xs text-red-500">{error}</p>
        </div>
      )}

      <div className="border-t border-bloomberg-border p-4">
        <button
          onClick={undelegateExecutor}
          disabled={isLoading}
          className="w-full border-bloomberg bg-bloomberg-tertiary px-4 py-2 text-xs text-muted hover:text-red-500 disabled:opacity-50"
        >
          {isLoading ? "UNDELEGATING..." : "UNDELEGATE EXECUTOR"}
        </button>
      </div>
    </div>
  );
}
