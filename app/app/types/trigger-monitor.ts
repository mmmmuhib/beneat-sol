export type TriggerCondition = "above" | "below" | "cross_above" | "cross_below";

export interface TriggerOrderConfig {
  id: string;
  positionId: string;
  token: string;
  side: "long" | "short";
  type: "stop_loss" | "take_profit";
  triggerPrice: number;
  triggerCondition: TriggerCondition;
  sizeAmount: string;
  createdAt: number;
  expiresAt?: number;
}

export interface TriggerMatch {
  orderId: string;
  currentPrice: number;
  triggerPrice: number;
  condition: TriggerCondition;
  matchedAt: number;
}

export interface MonitorState {
  isRunning: boolean;
  lastCheck: number | null;
  activeOrders: number;
  matchedOrders: TriggerMatch[];
  errors: string[];
}

export const MAX_TRIGGERS_PER_BATCH = 3;
export const MONITOR_INTERVAL_MS = 500;
export const PRICE_STALENESS_MS = 5000;

export function shouldTrigger(
  currentPrice: number,
  triggerPrice: number,
  condition: TriggerCondition,
  previousPrice?: number
): boolean {
  switch (condition) {
    case "above":
      return currentPrice >= triggerPrice;
    case "below":
      return currentPrice <= triggerPrice;
    case "cross_above":
      return previousPrice !== undefined &&
             previousPrice < triggerPrice &&
             currentPrice >= triggerPrice;
    case "cross_below":
      return previousPrice !== undefined &&
             previousPrice > triggerPrice &&
             currentPrice <= triggerPrice;
    default:
      return false;
  }
}

export function inferTriggerCondition(
  type: "stop_loss" | "take_profit",
  side: "long" | "short",
  _triggerPrice: number,
  _currentPrice: number
): TriggerCondition {
  if (type === "stop_loss") {
    return side === "long" ? "below" : "above";
  }
  return side === "long" ? "above" : "below";
}
