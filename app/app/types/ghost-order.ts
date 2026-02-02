import type { BN } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";

export type TriggerCondition = { above: {} } | { below: {} };

export type OrderSide = { long: {} } | { short: {} };

export type OrderStatus =
  | { pending: {} }
  | { active: {} }
  | { triggered: {} }
  | { executed: {} }
  | { cancelled: {} }
  | { expired: {} };

export type GhostOrderType =
  | "stop_loss"
  | "take_profit"
  | "limit_buy"
  | "limit_sell";

export interface OnChainGhostOrder {
  owner: PublicKey;
  orderId: BN;
  marketIndex: number;
  triggerPrice: BN;
  triggerCondition: TriggerCondition;
  orderSide: OrderSide;
  baseAssetAmount: BN;
  reduceOnly: boolean;
  status: OrderStatus;
  createdAt: BN;
  triggeredAt: BN;
  executedAt: BN;
  expiry: BN;
  feedId: number[];
  crankTaskId: BN;
  executionPrice: BN;
  bump: number;
}

export interface GhostOrderDisplay {
  publicKey: string;
  orderId: number;
  type: GhostOrderType;
  marketIndex: number;
  token: string;
  triggerPrice: number;
  triggerCondition: "above" | "below";
  orderSide: "long" | "short";
  size: bigint;
  reduceOnly: boolean;
  status: string;
  createdAt: number;
  expiresAt: number;
  executionPrice: number;
}

export interface CreateGhostOrderParams {
  type: GhostOrderType;
  marketIndex: number;
  token: string;
  triggerPrice: number;
  size: bigint;
  direction: "long" | "short";
  expiryMinutes?: number;
  reduceOnly?: boolean;
  feedId: number[];
  positionId?: string;
}

export interface GhostOrderResult {
  success: boolean;
  signature?: string;
  error?: string;
}

export function getOrderStatusString(status: OrderStatus): string {
  if ("pending" in status) return "pending";
  if ("active" in status) return "active";
  if ("triggered" in status) return "triggered";
  if ("executed" in status) return "executed";
  if ("cancelled" in status) return "cancelled";
  if ("expired" in status) return "expired";
  return "unknown";
}

export function isOrderActive(status: OrderStatus): boolean {
  return "active" in status;
}

export function mapOrderTypeToOnChain(
  type: GhostOrderType,
  direction: "long" | "short"
): { triggerCondition: TriggerCondition; orderSide: OrderSide } {
  switch (type) {
    case "stop_loss":
      return direction === "long"
        ? { triggerCondition: { below: {} }, orderSide: { long: {} } }
        : { triggerCondition: { above: {} }, orderSide: { short: {} } };
    case "take_profit":
      return direction === "long"
        ? { triggerCondition: { above: {} }, orderSide: { long: {} } }
        : { triggerCondition: { below: {} }, orderSide: { short: {} } };
    case "limit_buy":
      return { triggerCondition: { below: {} }, orderSide: { long: {} } };
    case "limit_sell":
      return { triggerCondition: { above: {} }, orderSide: { short: {} } };
  }
}

function inferOrderType(
  triggerCondition: TriggerCondition,
  orderSide: OrderSide
): GhostOrderType {
  const isAbove = "above" in triggerCondition;
  const isLong = "long" in orderSide;

  if (!isAbove && isLong) return "stop_loss";
  if (isAbove && !isLong) return "stop_loss";
  if (isAbove && isLong) return "take_profit";
  if (!isAbove && !isLong) return "take_profit";

  return "limit_buy";
}

export function toDisplayOrder(
  order: OnChainGhostOrder,
  publicKey: string,
  tokenMap: Record<number, string>
): GhostOrderDisplay {
  return {
    publicKey,
    orderId: order.orderId.toNumber(),
    type: inferOrderType(order.triggerCondition, order.orderSide),
    marketIndex: order.marketIndex,
    token: tokenMap[order.marketIndex] ?? `Market-${order.marketIndex}`,
    triggerPrice: order.triggerPrice.toNumber(),
    triggerCondition: "above" in order.triggerCondition ? "above" : "below",
    orderSide: "long" in order.orderSide ? "long" : "short",
    size: BigInt(order.baseAssetAmount.toString()),
    reduceOnly: order.reduceOnly,
    status: getOrderStatusString(order.status),
    createdAt: order.createdAt.toNumber() * 1000,
    expiresAt: order.expiry.toNumber() * 1000,
    executionPrice: order.executionPrice.toNumber(),
  };
}
