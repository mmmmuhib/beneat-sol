import type { BN } from "@coral-xyz/anchor";

export const DRIFT_PROGRAM_ID = "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH";
export const DEVNET_DRIFT_PROGRAM_ID = "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH";

export const DRIFT_MARKET_INDICES = {
  "SOL-PERP": 0,
  "BTC-PERP": 1,
  "ETH-PERP": 2,
  "APT-PERP": 3,
  "BONK-PERP": 4,
  "MATIC-PERP": 5,
  "ARB-PERP": 6,
  "DOGE-PERP": 7,
  "BNB-PERP": 8,
  "SUI-PERP": 9,
  "PEPE-PERP": 10,
  "OP-PERP": 11,
  "RENDER-PERP": 12,
  "XRP-PERP": 13,
  "HNT-PERP": 14,
  "INJ-PERP": 15,
  "LINK-PERP": 16,
  "RLB-PERP": 17,
  "PYTH-PERP": 18,
  "TIA-PERP": 19,
  "JTO-PERP": 20,
  "SEI-PERP": 21,
  "AVAX-PERP": 22,
  "WIF-PERP": 23,
  "JUP-PERP": 24,
  "DYM-PERP": 25,
  "TAO-PERP": 26,
  "W-PERP": 27,
  "KMNO-PERP": 28,
  "TNSR-PERP": 29,
  "DRIFT-PERP": 30,
} as const;

export type DriftMarketSymbol = keyof typeof DRIFT_MARKET_INDICES;

export type OracleSource =
  | "pyth"
  | "pythPull"
  | "pyth1K"
  | "pyth1KPull"
  | "pyth1M"
  | "pyth1MPull"
  | "pythStableCoin"
  | "pythStableCoinPull"
  | "switchboard"
  | "switchboardOnDemand"
  | "quoteAsset"
  | "prelaunch";

export type PositionDirection = "long" | "short";

export interface DriftMarket {
  symbol: string;
  baseAssetSymbol: string;
  marketIndex: number;
  oracle: string;
  oracleSource: OracleSource;
  pythFeedId?: string;
  launchTs?: number;
  fullName?: string;
  category?: string[];
}

export interface DriftPosition {
  id: string;
  marketIndex: number;
  baseAssetSymbol: string;
  side: PositionDirection;
  baseAssetAmount: BN;
  quoteAssetAmount: BN;
  quoteEntryAmount: BN;
  quoteBreakEvenAmount: BN;
  settledPnl: BN;
  openOrders: number;
  openBids: BN;
  openAsks: BN;
  lpShares: BN;
  lastCumulativeFundingRate: BN;
  lastBaseAssetAmountPerLp: BN;
  lastQuoteAssetAmountPerLp: BN;
  perLpBase: number;
  remainderBaseAssetAmount: number;
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number;
  unrealizedPnl: number;
  leverage: number;
  timestamp: number;
}

export interface DriftPositionSimplified {
  id: string;
  token: string;
  marketIndex: number;
  side: PositionDirection;
  size: number;
  entryPrice: number;
  markPrice: number;
  leverage: number;
  unrealizedPnl: number;
  liquidationPrice: number;
  baseAssetAmount: string;
  quoteAssetAmount: string;
  timestamp: number;
}

export interface OpenPositionParams {
  marketIndex: number;
  baseAssetSymbol: string;
  direction: PositionDirection;
  baseAssetAmount: BN;
  price?: BN;
  reduceOnly?: boolean;
  postOnly?: boolean;
  immediateOrCancel?: boolean;
  maxTs?: number;
  triggerPrice?: BN;
  triggerCondition?: "above" | "below";
  oraclePriceOffset?: number;
  auctionDuration?: number;
  auctionStartPrice?: BN;
  auctionEndPrice?: BN;
}

export interface OpenPositionParamsSimplified {
  token: string;
  side: PositionDirection;
  collateralAmount: number;
  leverage: number;
  slippageBps?: number;
  reduceOnly?: boolean;
  postOnly?: boolean;
  immediateOrCancel?: boolean;
  limitPrice?: number;
}

export interface ClosePositionParams {
  marketIndex: number;
  baseAssetAmount?: BN;
  reduceOnly?: boolean;
  price?: BN;
  immediateOrCancel?: boolean;
}

export interface ClosePositionParamsSimplified {
  positionId: string;
  token: string;
  side: PositionDirection;
  percentage?: number;
  slippageBps?: number;
}

export interface PlaceTriggerOrderParamsSimplified {
  positionId: string;
  token: string;
  side: PositionDirection;
  type: "stop_loss" | "take_profit";
  triggerPrice: number;
  sizePercent?: number;
}

export interface TradeResult {
  success: boolean;
  signature?: string;
  position?: DriftPositionSimplified;
  error?: string;
  executedPrice?: number;
  executedSize?: number;
  fees?: number;
  timestamp: number;
}

export interface DriftOrder {
  orderId: number;
  marketIndex: number;
  marketType: "perp" | "spot";
  direction: PositionDirection;
  baseAssetAmount: BN;
  price: BN;
  status: "open" | "filled" | "canceled" | "expired";
  orderType: "market" | "limit" | "triggerMarket" | "triggerLimit";
  triggerPrice?: BN;
  triggerCondition?: "above" | "below";
  reduceOnly: boolean;
  postOnly: boolean;
  immediateOrCancel: boolean;
  slot: number;
  timestamp: number;
}

export interface DriftOrderSimplified {
  id: string;
  token: string;
  marketIndex: number;
  side: PositionDirection;
  size: number;
  price: number;
  status: "pending" | "filled" | "cancelled";
  orderType: "market" | "limit" | "stop_loss" | "take_profit";
  triggerPrice?: number;
  reduceOnly: boolean;
  timestamp: number;
}

export interface DriftTriggerOrder {
  id: string;
  positionId: string;
  marketIndex: number;
  token: string;
  side: PositionDirection;
  type: "stop_loss" | "take_profit";
  triggerPrice: number;
  sizeAmount: string;
  status: "active" | "triggered" | "cancelled";
  orderId?: number;
  timestamp: number;
}

export interface DriftAccountInfo {
  authority: string;
  subAccountId: number;
  name: string;
  totalCollateral: BN;
  freeCollateral: BN;
  marginRequirement: BN;
  leverage: number;
  perpPositions: DriftPosition[];
  orders: DriftOrder[];
}

export interface DriftConfig {
  rpcUrl?: string;
  priorityFee?: number;
  slippageBps?: number;
  subAccountId?: number;
  env?: "mainnet-beta" | "devnet";
}

export const DRIFT_PRECISION = {
  BASE: 1e9,
  QUOTE: 1e6,
  PRICE: 1e6,
  FUNDING: 1e9,
  PERCENTAGE: 1e6,
} as const;

export const DRIFT_DEFAULT_CONFIG: DriftConfig = {
  priorityFee: 50000,
  slippageBps: 100,
  subAccountId: 0,
  env: "mainnet-beta",
};
