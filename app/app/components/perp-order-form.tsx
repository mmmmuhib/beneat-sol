"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useDrift } from "../hooks/use-drift";
import { useMagicBlock } from "../hooks/use-magicblock";
import { useVault } from "../hooks/use-vault";
import { useBehavioralAnalysis } from "../hooks/use-behavioral-analysis";
import { usePriceStore } from "../stores/price-store";
import { useBehavioralStore } from "../stores/behavioral-store";
import { BehavioralAnalysis } from "./behavioral-analysis";
import { useShield } from "../hooks/use-shield";
import { ShieldModeToggle } from "./shield-mode-toggle";
import { GhostModeToggle } from "./ghost-mode-toggle";

const SLIPPAGE_PRESETS = [50, 100, 200] as const;
const TRADING_FEE_BPS = 10;

interface PerpOrderFormProps {
  token: string;
  className?: string;
}

export function PerpOrderForm({ token, className = "" }: PerpOrderFormProps) {
  const [side, setSide] = useState<"long" | "short">("long");
  const [collateral, setCollateral] = useState("");
  const [leverage, setLeverage] = useState(5);
  const [showConfirm, setShowConfirm] = useState(false);
  const [slippageBps, setSlippageBps] = useState(100);
  const [showSlippageInput, setShowSlippageInput] = useState(false);
  const [stopLossPrice, setStopLossPrice] = useState("");
  const [takeProfitPrice, setTakeProfitPrice] = useState("");

  const { openPosition, placeTriggerOrder, isLoading, error } = useDrift();
  const { isLocked, tradesToday, maxTradesPerDay, vault, balance } = useVault();
  const { getPrice } = usePriceStore();
  const behavioralState = useBehavioralAnalysis();
  const { getCooldownRemaining } = useBehavioralStore();
  const {
    shieldMode,
    executeShieldedTrade,
    isShielding,
    shieldError
  } = useShield();

  const { isPrivacyModeEnabled: isGhostMode, createGhostOrder } = useMagicBlock();

  const [isOverridden, setIsOverridden] = useState(false);

  const currentPrice = getPrice(token) || 0;
  const collateralNum = parseFloat(collateral) || 0;
  const positionSize = collateralNum * leverage;
  const positionSizeUsd = positionSize * currentPrice;

  const liquidationPrice = useMemo(() => {
    if (!currentPrice || !collateralNum) return 0;
    const liquidationDistance = currentPrice / leverage;
    return side === "long"
      ? currentPrice - liquidationDistance * 0.9
      : currentPrice + liquidationDistance * 0.9;
  }, [currentPrice, leverage, side, collateralNum]);

  useEffect(() => {
    setStopLossPrice("");
    setTakeProfitPrice("");
  }, [side]);

  const stopLossValidation = useMemo(() => {
    const slPrice = parseFloat(stopLossPrice);
    if (!stopLossPrice || isNaN(slPrice) || slPrice <= 0) {
      return { valid: false, error: null };
    }

    if (side === "long") {
      if (slPrice >= currentPrice) {
        return { valid: false, error: "SL must be below entry price" };
      }
      if (slPrice <= liquidationPrice) {
        return { valid: false, error: "SL must be above liquidation price" };
      }
    } else {
      if (slPrice <= currentPrice) {
        return { valid: false, error: "SL must be above entry price" };
      }
      if (slPrice >= liquidationPrice) {
        return { valid: false, error: "SL must be below liquidation price" };
      }
    }

    return { valid: true, error: null };
  }, [stopLossPrice, side, currentPrice, liquidationPrice]);

  const takeProfitValidation = useMemo(() => {
    const tpPrice = parseFloat(takeProfitPrice);
    if (!takeProfitPrice || isNaN(tpPrice) || tpPrice <= 0) {
      return { valid: true, error: null };
    }

    if (side === "long") {
      if (tpPrice <= currentPrice) {
        return { valid: false, error: "TP must be above entry price" };
      }
    } else {
      if (tpPrice >= currentPrice) {
        return { valid: false, error: "TP must be below entry price" };
      }
    }

    return { valid: true, error: null };
  }, [takeProfitPrice, side, currentPrice]);

  const estimatedStopLossPnl = useMemo(() => {
    const slPrice = parseFloat(stopLossPrice);
    if (!stopLossValidation.valid || isNaN(slPrice) || !currentPrice) return null;

    const priceDiff = slPrice - currentPrice;
    const pnlPercent = (priceDiff / currentPrice) * 100 * leverage * (side === "long" ? 1 : -1);
    const pnlUsd = priceDiff * positionSize * (side === "long" ? 1 : -1);

    return { percent: pnlPercent, usd: pnlUsd };
  }, [stopLossPrice, stopLossValidation.valid, currentPrice, leverage, side, positionSize]);

  const estimatedTakeProfitPnl = useMemo(() => {
    const tpPrice = parseFloat(takeProfitPrice);
    if (!takeProfitValidation.valid || isNaN(tpPrice) || !currentPrice || !tpPrice) return null;

    const priceDiff = tpPrice - currentPrice;
    const pnlPercent = (priceDiff / currentPrice) * 100 * leverage * (side === "long" ? 1 : -1);
    const pnlUsd = priceDiff * positionSize * (side === "long" ? 1 : -1);

    return { percent: pnlPercent, usd: pnlUsd };
  }, [takeProfitPrice, takeProfitValidation.valid, currentPrice, leverage, side, positionSize]);

  const vaultBalanceSol = useMemo(() => {
    return Number(balance) / 1e9;
  }, [balance]);

  const tradingFeeUsd = useMemo(() => {
    return (positionSizeUsd * TRADING_FEE_BPS) / 10000;
  }, [positionSizeUsd]);

  const handleMaxClick = useCallback(() => {
    if (vaultBalanceSol > 0) {
      setCollateral(vaultBalanceSol.toFixed(4));
    }
  }, [vaultBalanceSol]);

  const handleSlippageChange = useCallback((value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 1 && num <= 1000) {
      setSlippageBps(num);
    }
  }, []);

  const hasValidStopLoss = useMemo(() => {
    const slPrice = parseFloat(stopLossPrice);
    return !isNaN(slPrice) && slPrice > 0 && stopLossValidation.valid;
  }, [stopLossPrice, stopLossValidation.valid]);

  const userCooldownRemaining = getCooldownRemaining();
  const isBehavioralBlocked = useMemo(() => {
    if (isOverridden) return false;
    if (userCooldownRemaining > 0) return true;
    if (behavioralState.riskLevel === "critical") return true;
    return false;
  }, [isOverridden, userCooldownRemaining, behavioralState.riskLevel]);

  const isAnyLoading = isLoading || isShielding;

  const canTrade = useMemo(() => {
    if (isLocked) return false;
    if (!vault) return false;
    if (collateralNum <= 0) return false;
    if (isAnyLoading) return false;
    if (maxTradesPerDay > 0 && tradesToday >= maxTradesPerDay) return false;
    if (!hasValidStopLoss) return false;
    if (!takeProfitValidation.valid) return false;
    if (isBehavioralBlocked) return false;
    return true;
  }, [isLocked, vault, collateralNum, isAnyLoading, maxTradesPerDay, tradesToday, hasValidStopLoss, takeProfitValidation.valid, isBehavioralBlocked]);

  const isFormDimmed = !isOverridden && (behavioralState.riskLevel === "high" || behavioralState.riskLevel === "critical");

  const handleBehavioralOverride = useCallback(() => {
    setIsOverridden(true);
  }, []);

  const handleBehavioralWait = useCallback(() => {
    setIsOverridden(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canTrade) return;

    if (shieldMode) {
      const result = await executeShieldedTrade({
        token,
        side,
        collateralAmount: collateralNum,
        leverage,
        slippageBps,
      });

      if (result.success) {
        setCollateral("");
        setStopLossPrice("");
        setTakeProfitPrice("");
        setShowConfirm(false);
        setIsOverridden(false);
      }
    } else {
      const result = await openPosition({
        token,
        side,
        collateralAmount: collateralNum,
        leverage,
      });

      if (result.success && result.position) {
        const positionId = result.position.id;

        const marketIndexMap: Record<string, number> = { SOL: 0, BTC: 1, ETH: 2 };
        const marketIndex = marketIndexMap[token];

        if (marketIndex !== undefined) {
          const sizeLamports = BigInt(Math.floor(positionSize * 1e9));
          const stopLoss = parseFloat(stopLossPrice);
          const tpPrice = parseFloat(takeProfitPrice);
          const hasTakeProfit = !isNaN(tpPrice) && tpPrice > 0 && takeProfitValidation.valid;

          if (isGhostMode) {
            const triggerPromises: Promise<unknown>[] = [
              createGhostOrder({
                type: "stop_loss",
                marketIndex,
                token,
                triggerPrice: stopLoss,
                size: sizeLamports,
                direction: side,
                reduceOnly: true,
                feedId: Array(32).fill(0),
                positionId,
              }),
            ];

            if (hasTakeProfit) {
              triggerPromises.push(
                createGhostOrder({
                  type: "take_profit",
                  marketIndex,
                  token,
                  triggerPrice: tpPrice,
                  size: sizeLamports,
                  direction: side,
                  reduceOnly: true,
                  feedId: Array(32).fill(0),
                  positionId,
                })
              );
            }

            await Promise.all(triggerPromises);
          } else {
            const triggerPromises: Promise<unknown>[] = [
              placeTriggerOrder({
                positionId,
                token,
                side,
                type: "stop_loss",
                triggerPrice: stopLoss,
                sizePercent: 100,
              }),
            ];

            if (hasTakeProfit) {
              triggerPromises.push(
                placeTriggerOrder({
                  positionId,
                  token,
                  side,
                  type: "take_profit",
                  triggerPrice: tpPrice,
                  sizePercent: 100,
                })
              );
            }

            await Promise.all(triggerPromises);
          }
        }

        setCollateral("");
        setStopLossPrice("");
        setTakeProfitPrice("");
        setShowConfirm(false);
        setIsOverridden(false);
      }
    }
  }, [
    canTrade,
    shieldMode,
    executeShieldedTrade,
    openPosition,
    placeTriggerOrder,
    token,
    side,
    collateralNum,
    leverage,
    slippageBps,
    stopLossPrice,
    takeProfitPrice,
    takeProfitValidation.valid,
    isGhostMode,
    createGhostOrder,
    positionSize,
  ]);

  const getButtonText = () => {
    if (isShielding) return "SHIELDING TRADE...";
    if (isLoading) return "OPENING POSITION...";
    if (isLocked) return "TRADING LOCKED";
    if (isBehavioralBlocked) return "COOLDOWN ACTIVE";
    if (maxTradesPerDay > 0 && tradesToday >= maxTradesPerDay) return "TRADE LIMIT REACHED";
    if (!vault) return "INITIALIZE VAULT FIRST";
    if (collateralNum > 0 && !hasValidStopLoss) return "SET STOP LOSS";
    return `OPEN ${side === "long" ? "LONG" : "SHORT"}`;
  };

  return (
    <div className={`space-y-0 ${className}`}>
      <BehavioralAnalysis
        state={behavioralState}
        onOverride={handleBehavioralOverride}
        onWait={handleBehavioralWait}
      />

      <div className="border-bloomberg bg-bloomberg-secondary">
        <div className="border-bottom px-4 py-3 flex items-center justify-between">
          <span className="text-bloomberg-header">PLACE ORDER</span>
        </div>

        <div className="px-4 pt-3">
          <ShieldModeToggle compact />
          <div className="mt-2">
            <GhostModeToggle compact />
          </div>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-px">
            <button
              onClick={() => setSide("long")}
              className={`py-3 text-bloomberg-label font-semibold transition ${
                side === "long"
                  ? "border-bloomberg bg-[#0a2a12] text-profit border-[var(--profit-green)]"
                  : "border-bloomberg bg-bloomberg-tertiary text-profit hover:bg-[#0a2a12]"
              }`}
            >
              LONG ▲
            </button>
            <button
              onClick={() => setSide("short")}
              className={`py-3 text-bloomberg-label font-semibold transition ${
                side === "short"
                  ? "border-bloomberg bg-[#2a0a0a] text-loss border-[var(--loss-red)]"
                  : "border-bloomberg bg-bloomberg-tertiary text-loss hover:bg-[#2a0a0a]"
              }`}
            >
              SHORT ▼
            </button>
          </div>

          <div className={`space-y-4 transition-opacity duration-300 ${isFormDimmed ? "opacity-50 pointer-events-none" : ""}`}>
            <div>
              <label className="mb-1.5 block text-bloomberg-label">
                COLLATERAL ({token})
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={collateral}
                  onChange={(e) => setCollateral(e.target.value)}
                  disabled={isLocked || isAnyLoading}
                  className="w-full border-bloomberg bg-bloomberg-primary px-4 py-3 pr-16 font-mono text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--border-focus)] disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={handleMaxClick}
                  disabled={isLocked || isAnyLoading || vaultBalanceSol <= 0}
                  className="absolute right-2 top-1/2 -translate-y-1/2 border-bloomberg bg-bloomberg-tertiary px-2 py-1 text-bloomberg-label text-accent transition hover:bg-[var(--border-color)] disabled:opacity-40"
                >
                  MAX
                </button>
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-bloomberg-label">LEVERAGE</label>
                <span className="text-bloomberg-value text-accent">{leverage}x</span>
              </div>
              <input
                type="range"
                min={1}
                max={100}
                value={leverage}
                onChange={(e) => setLeverage(parseInt(e.target.value))}
                disabled={isLocked || isAnyLoading}
                className="w-full accent-[var(--accent-orange)]"
              />
              <div className="mt-1.5 flex justify-between">
                {[1, 25, 50, 100].map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setLeverage(lvl)}
                    className={`text-bloomberg-label transition ${
                      leverage === lvl ? "text-accent" : "hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {lvl}x
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-bloomberg-label">SLIPPAGE TOLERANCE</label>
                <span className="text-bloomberg-value">{(slippageBps / 100).toFixed(2)}%</span>
              </div>
              <div className="flex gap-1">
                {SLIPPAGE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setSlippageBps(preset);
                      setShowSlippageInput(false);
                    }}
                    className={`flex-1 py-2 text-bloomberg-label font-semibold transition ${
                      slippageBps === preset && !showSlippageInput
                        ? "border-focus-bloomberg bg-bloomberg-tertiary text-accent"
                        : "border-bloomberg bg-bloomberg-primary hover:bg-bloomberg-tertiary"
                    }`}
                  >
                    {(preset / 100).toFixed(1)}%
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setShowSlippageInput(!showSlippageInput)}
                  className={`flex-1 py-2 text-bloomberg-label font-semibold transition ${
                    showSlippageInput || !SLIPPAGE_PRESETS.includes(slippageBps as typeof SLIPPAGE_PRESETS[number])
                      ? "border-focus-bloomberg bg-bloomberg-tertiary text-accent"
                      : "border-bloomberg bg-bloomberg-primary hover:bg-bloomberg-tertiary"
                  }`}
                >
                  CUSTOM
                </button>
              </div>
              {showSlippageInput && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    step="1"
                    value={slippageBps}
                    onChange={(e) => handleSlippageChange(e.target.value)}
                    className="w-full border-bloomberg bg-bloomberg-primary px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--border-focus)]"
                    placeholder="100"
                  />
                  <span className="text-bloomberg-label">BPS</span>
                </div>
              )}
            </div>

            <div className="border-bloomberg bg-bloomberg-primary p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-bloomberg-label">RISK MANAGEMENT</span>
                <span className="text-bloomberg-label text-loss">* REQUIRED</span>
              </div>

              <div>
                <label className="mb-1.5 flex items-center gap-1 text-bloomberg-label">
                  <span className="text-loss">STOP LOSS</span>
                  <span className="text-loss">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={side === "long" ? `Below ${currentPrice.toFixed(2)}` : `Above ${currentPrice.toFixed(2)}`}
                    value={stopLossPrice}
                    onChange={(e) => setStopLossPrice(e.target.value)}
                    disabled={isLocked || isAnyLoading}
                    className={`w-full bg-bloomberg-tertiary py-2 pl-7 pr-3 font-mono text-sm outline-none transition placeholder:text-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-60 ${
                      stopLossValidation.error
                        ? "border-bloomberg border-[var(--loss-red)]"
                        : stopLossValidation.valid && stopLossPrice
                        ? "border-bloomberg border-[var(--loss-red)]"
                        : "border-bloomberg focus:border-[var(--loss-red)]"
                    }`}
                  />
                  {stopLossValidation.valid && stopLossPrice && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-loss">✓</span>
                  )}
                </div>
                {stopLossValidation.error && (
                  <p className="mt-1 text-bloomberg-label text-loss">{stopLossValidation.error}</p>
                )}
                {estimatedStopLossPnl && (
                  <p className="mt-1 text-bloomberg-label text-loss">
                    EST. LOSS: {estimatedStopLossPnl.usd >= 0 ? "+" : ""}${estimatedStopLossPnl.usd.toFixed(2)} ({estimatedStopLossPnl.percent >= 0 ? "+" : ""}{estimatedStopLossPnl.percent.toFixed(2)}%)
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-bloomberg-label text-profit">
                  TAKE PROFIT (OPTIONAL)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={side === "long" ? `Above ${currentPrice.toFixed(2)}` : `Below ${currentPrice.toFixed(2)}`}
                    value={takeProfitPrice}
                    onChange={(e) => setTakeProfitPrice(e.target.value)}
                    disabled={isLocked || isAnyLoading}
                    className={`w-full bg-bloomberg-tertiary py-2 pl-7 pr-3 font-mono text-sm outline-none transition placeholder:text-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-60 ${
                      takeProfitValidation.error
                        ? "border-bloomberg border-[var(--loss-red)]"
                        : takeProfitValidation.valid && takeProfitPrice
                        ? "border-bloomberg border-[var(--profit-green)]"
                        : "border-bloomberg focus:border-[var(--profit-green)]"
                    }`}
                  />
                  {takeProfitValidation.valid && takeProfitPrice && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-profit">✓</span>
                  )}
                </div>
                {takeProfitValidation.error && (
                  <p className="mt-1 text-bloomberg-label text-loss">{takeProfitValidation.error}</p>
                )}
                {estimatedTakeProfitPnl && (
                  <p className="mt-1 text-bloomberg-label text-profit">
                    EST. PROFIT: +${estimatedTakeProfitPnl.usd.toFixed(2)} (+{estimatedTakeProfitPnl.percent.toFixed(2)}%)
                  </p>
                )}
              </div>
            </div>

            <div className="border-bloomberg bg-bloomberg-primary p-3 space-y-2">
              <div className="flex justify-between">
                <span className="text-bloomberg-label">POSITION SIZE</span>
                <span className="text-bloomberg-value">{positionSize.toFixed(4)} {token}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-bloomberg-label">VALUE</span>
                <span className="text-bloomberg-value">
                  ${positionSizeUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-bloomberg-label">LIQ. PRICE</span>
                <span className={`text-bloomberg-value ${side === "long" ? "text-loss" : "text-profit"}`}>
                  ${liquidationPrice.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-bloomberg-label">ENTRY PRICE</span>
                <span className="text-bloomberg-value">${currentPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-[var(--border-color)] pt-2">
                <span className="text-bloomberg-label">TRADING FEE (0.1%)</span>
                <span className="text-bloomberg-value">
                  ${tradingFeeUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {!showConfirm ? (
            <button
              onClick={() => canTrade && setShowConfirm(true)}
              disabled={!canTrade}
              className={`w-full py-4 text-bloomberg-label font-semibold transition ${
                side === "long"
                  ? "border-bloomberg bg-[#0a2a12] text-profit hover:bg-[#0f3518] disabled:bg-bloomberg-tertiary disabled:text-[var(--text-muted)]"
                  : "border-bloomberg bg-[#2a0a0a] text-loss hover:bg-[#351010] disabled:bg-bloomberg-tertiary disabled:text-[var(--text-muted)]"
              } disabled:cursor-not-allowed`}
            >
              {getButtonText()}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="border-bloomberg bg-bloomberg-primary p-3 space-y-2">
                <p className="text-center text-bloomberg-label">
                  CONFIRM {side.toUpperCase()} POSITION
                </p>
                <div className="flex justify-between">
                  <span className="text-bloomberg-label text-loss">STOP LOSS</span>
                  <span className="text-bloomberg-value text-loss">${parseFloat(stopLossPrice).toFixed(2)}</span>
                </div>
                {takeProfitPrice && parseFloat(takeProfitPrice) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-bloomberg-label text-profit">TAKE PROFIT</span>
                    <span className="text-bloomberg-value text-profit">${parseFloat(takeProfitPrice).toFixed(2)}</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-px">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="border-bloomberg bg-bloomberg-tertiary py-3 text-bloomberg-label font-semibold transition hover:bg-[var(--border-color)]"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isAnyLoading}
                  className={`py-3 text-bloomberg-label font-semibold transition ${
                    side === "long"
                      ? "border-bloomberg bg-[#0a2a12] text-profit hover:bg-[#0f3518]"
                      : "border-bloomberg bg-[#2a0a0a] text-loss hover:bg-[#351010]"
                  } disabled:opacity-50`}
                >
                  {isAnyLoading ? "..." : "CONFIRM"}
                </button>
              </div>
            </div>
          )}

          {(error || shieldError) && (
            <div className="border-bloomberg border-[var(--loss-red)] bg-[#1a0505] p-2">
              <p className="text-center text-bloomberg-label text-loss">{error || shieldError}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
