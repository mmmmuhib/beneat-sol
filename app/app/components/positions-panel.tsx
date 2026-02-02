"use client";

import { useState, memo, useMemo, useCallback } from "react";
import { useTradingStore, type Position, type TriggerOrder } from "../stores/trading-store";
import { useDrift } from "../hooks/use-drift";
import { usePriceStore } from "../stores/price-store";
import { TriggerOrderModal } from "./trigger-order-modal";
import { TriggerOrderBadge } from "./trigger-order-badge";

interface PositionsPanelProps {
  className?: string;
}

interface ModalState {
  position: Position;
  initialType: "stop_loss" | "take_profit";
}

interface PositionCardProps {
  position: Position;
  currentPrice: number;
  triggerOrders: TriggerOrder[];
  onOpenModal: (type: "stop_loss" | "take_profit") => void;
  onCancelOrder: (order: TriggerOrder) => void;
  onEditOrder: (order: TriggerOrder) => void;
  onClose: () => void;
  isLoading: boolean;
}

const PositionCard = memo(function PositionCard({
  position,
  currentPrice,
  triggerOrders,
  onOpenModal,
  onCancelOrder,
  onEditOrder,
  onClose,
  isLoading,
}: PositionCardProps) {
  const { pnlPercent, pnlUsd } = useMemo(() => {
    const priceDiff = currentPrice - position.entryPrice;
    const rawPnlPercent = (priceDiff / position.entryPrice) * 100 * position.leverage;
    const rawPnlUsd = priceDiff * position.size;

    return position.side === "short"
      ? { pnlPercent: -rawPnlPercent, pnlUsd: -rawPnlUsd }
      : { pnlPercent: rawPnlPercent, pnlUsd: rawPnlUsd };
  }, [currentPrice, position.entryPrice, position.leverage, position.size, position.side]);

  const isProfitable = pnlUsd >= 0;
  const stopLossOrder = triggerOrders.find((o) => o.type === "stop_loss");
  const takeProfitOrder = triggerOrders.find((o) => o.type === "take_profit");

  return (
    <div className="border-bottom p-4 hover:bg-bloomberg-tertiary transition">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`border-bloomberg px-2 py-0.5 text-bloomberg-label font-semibold ${
              position.side === "long"
                ? "bg-[#0a2a12] text-profit"
                : "bg-[#2a0a0a] text-loss"
            }`}
          >
            {position.side === "long" ? "LONG ▲" : "SHORT ▼"}
          </div>
          <div>
            <p className="text-bloomberg-value">{position.token}</p>
            <p className="text-bloomberg-label">{position.leverage}X LEVERAGE</p>
          </div>
        </div>

        <div className="text-right">
          <p className={`text-bloomberg-value font-semibold ${isProfitable ? "text-profit" : "text-loss"}`}>
            {isProfitable ? "▲ +" : "▼ "}{pnlPercent.toFixed(2)}%
          </p>
          <p className={`text-bloomberg-label ${isProfitable ? "text-profit" : "text-loss"}`}>
            {isProfitable ? "+" : ""}${pnlUsd.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div>
          <p className="text-bloomberg-label">SIZE</p>
          <p className="text-bloomberg-value">{position.size.toFixed(4)}</p>
        </div>
        <div>
          <p className="text-bloomberg-label">ENTRY</p>
          <p className="text-bloomberg-value">${position.entryPrice.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-bloomberg-label">MARK</p>
          <p className="text-bloomberg-value">${currentPrice.toFixed(2)}</p>
        </div>
      </div>

      {(stopLossOrder || takeProfitOrder) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {stopLossOrder && (
            <TriggerOrderBadge
              order={stopLossOrder}
              onEdit={() => onEditOrder(stopLossOrder)}
              onCancel={() => onCancelOrder(stopLossOrder)}
              disabled={isLoading}
            />
          )}
          {takeProfitOrder && (
            <TriggerOrderBadge
              order={takeProfitOrder}
              onEdit={() => onEditOrder(takeProfitOrder)}
              onCancel={() => onCancelOrder(takeProfitOrder)}
              disabled={isLoading}
            />
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-bloomberg-label">LIQ:</span>
          <span className={`text-bloomberg-value ${position.side === "long" ? "text-loss" : "text-profit"}`}>
            ${position.liquidationPrice.toFixed(2)}
          </span>
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-orange)] animate-glow-pulse" aria-hidden="true" />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenModal("stop_loss")}
            disabled={isLoading}
            className="border-bloomberg bg-bloomberg-tertiary px-3 py-1.5 text-bloomberg-label text-accent transition hover:bg-[var(--border-color)] disabled:opacity-50"
          >
            SL/TP
          </button>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="border-bloomberg bg-[#2a0a0a] px-3 py-1.5 text-bloomberg-label text-loss transition hover:bg-[#351010] disabled:opacity-50"
          >
            {isLoading ? "CLOSING..." : "CLOSE"}
          </button>
        </div>
      </div>
    </div>
  );
});

export function PositionsPanel({ className = "" }: PositionsPanelProps) {
  const { positions, getTriggerOrdersForPosition } = useTradingStore();
  const { closePosition, placeTriggerOrder, cancelTriggerOrder, isLoading } = useDrift();
  const { getPrice } = usePriceStore();

  const [modalState, setModalState] = useState<ModalState | null>(null);

  const handleOpenModal = useCallback((position: Position, initialType: "stop_loss" | "take_profit") => {
    setModalState({ position, initialType });
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalState(null);
  }, []);

  const handlePlaceOrder = useCallback(async (params: {
    positionId: string;
    token: string;
    side: "long" | "short";
    type: "stop_loss" | "take_profit";
    triggerPrice: number;
    sizePercent: number;
  }): Promise<TriggerOrder | null> => {
    const result = await placeTriggerOrder({
      positionId: params.positionId,
      token: params.token,
      side: params.side,
      type: params.type,
      triggerPrice: params.triggerPrice,
      sizePercent: params.sizePercent,
    });

    if (!result.success) return null;

    const updatedOrders = getTriggerOrdersForPosition(params.positionId)
      .filter((o) => o.type === params.type)
      .sort((a, b) => b.timestamp - a.timestamp);

    return updatedOrders[0] ?? null;
  }, [placeTriggerOrder, getTriggerOrdersForPosition]);

  const handleCancelOrder = useCallback(async (order: TriggerOrder) => {
    await cancelTriggerOrder(order.id);
  }, [cancelTriggerOrder]);

  const handleEditOrder = useCallback((position: Position, order: TriggerOrder) => {
    setModalState({ position, initialType: order.type });
  }, []);

  const handleClosePosition = useCallback((position: Position) => {
    closePosition({
      positionId: position.id,
      token: position.token,
      side: position.side,
    });
  }, [closePosition]);

  if (positions.length === 0) {
    return (
      <div className={`border-bloomberg bg-bloomberg-secondary ${className}`}>
        <div className="border-bottom px-4 py-3">
          <span className="text-bloomberg-label">POSITIONS</span>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center border-bloomberg bg-bloomberg-tertiary">
            <svg
              className="h-6 w-6 text-[var(--text-muted)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5"
              />
            </svg>
          </div>
          <p className="text-bloomberg-label">NO OPEN POSITIONS</p>
          <p className="mt-1 text-bloomberg-label text-[var(--text-muted)]">
            OPEN A POSITION TO START TRADING
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`border-bloomberg bg-bloomberg-secondary ${className}`}>
        <div className="border-bottom px-4 py-3 flex items-center justify-between">
          <span className="text-bloomberg-label">POSITIONS</span>
          <span className="border-bloomberg bg-bloomberg-tertiary px-2 py-0.5 text-bloomberg-label text-accent">
            {positions.length}
          </span>
        </div>

        <div>
          {positions.map((position) => {
            const currentPrice = getPrice(position.token) || position.entryPrice;
            const triggerOrders = getTriggerOrdersForPosition(position.id).filter(
              (o) => o.status === "active"
            );

            return (
              <PositionCard
                key={position.id}
                position={position}
                currentPrice={currentPrice}
                triggerOrders={triggerOrders}
                onOpenModal={(type) => handleOpenModal(position, type)}
                onCancelOrder={handleCancelOrder}
                onEditOrder={(order) => handleEditOrder(position, order)}
                onClose={() => handleClosePosition(position)}
                isLoading={isLoading}
              />
            );
          })}
        </div>
      </div>

      {modalState && (
        <TriggerOrderModal
          position={modalState.position}
          currentPrice={getPrice(modalState.position.token) || modalState.position.entryPrice}
          onClose={handleCloseModal}
          onPlaceOrder={handlePlaceOrder}
          initialType={modalState.initialType}
          isLoading={isLoading}
        />
      )}
    </>
  );
}
