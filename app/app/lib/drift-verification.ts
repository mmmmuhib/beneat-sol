import type { Connection, PublicKey as PublicKeyType } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  DRIFT_PROGRAM_ID,
  deriveUserPDA,
  deriveUserStatsPDA,
  derivePerpMarketPDA,
  deriveStatePDA,
  PERP_MARKET_ORACLE_ADDRESSES,
} from "./drift-instructions";

export interface DriftUserOrder {
  orderId: number;
  status: number;
  orderType: number;
  marketIndex: number;
  direction: number;
  baseAssetAmount: BN;
  price: BN;
  triggerPrice: BN;
  triggerCondition: number;
  reduceOnly: boolean;
  slot: number;
}

export interface DriftPerpPosition {
  marketIndex: number;
  baseAssetAmount: BN;
  quoteAssetAmount: BN;
  quoteBreakEvenAmount: BN;
  lastCumulativeFundingRate: BN;
  openOrders: number;
  openBids: BN;
  openAsks: BN;
}

export interface DriftUserAccountInfo {
  authority: PublicKeyType;
  subAccountId: number;
  name: string;
  orders: DriftUserOrder[];
  perpPositions: DriftPerpPosition[];
}

const DRIFT_USER_ACCOUNT_SIZE = 4376;
const ORDERS_OFFSET = 40;
const ORDERS_COUNT = 32;
const ORDER_SIZE = 91;
const PERP_POSITIONS_OFFSET = 2952;
const PERP_POSITIONS_COUNT = 8;
const PERP_POSITION_SIZE = 97;

function decodeOrder(data: Buffer, offset: number): DriftUserOrder {
  return {
    status: data.readUInt8(offset),
    orderType: data.readUInt8(offset + 1),
    marketIndex: data.readUInt16LE(offset + 4),
    direction: data.readUInt8(offset + 2),
    baseAssetAmount: new BN(data.subarray(offset + 8, offset + 16), "le"),
    price: new BN(data.subarray(offset + 24, offset + 32), "le"),
    triggerPrice: new BN(data.subarray(offset + 48, offset + 56), "le"),
    triggerCondition: data.readUInt8(offset + 3),
    reduceOnly: data.readUInt8(offset + 6) === 1,
    orderId: data.readUInt32LE(offset + 56),
    slot: Number(data.readBigUInt64LE(offset + 16)),
  };
}

function decodePerpPosition(data: Buffer, offset: number): DriftPerpPosition {
  return {
    marketIndex: data.readUInt16LE(offset + 88),
    baseAssetAmount: new BN(Buffer.from(data.subarray(offset, offset + 8)).reverse()),
    quoteAssetAmount: new BN(Buffer.from(data.subarray(offset + 8, offset + 16)).reverse()),
    quoteBreakEvenAmount: new BN(Buffer.from(data.subarray(offset + 16, offset + 24)).reverse()),
    lastCumulativeFundingRate: new BN(Buffer.from(data.subarray(offset + 24, offset + 40)).reverse()),
    openOrders: data.readUInt8(offset + 90),
    openBids: new BN(Buffer.from(data.subarray(offset + 40, offset + 48)).reverse()),
    openAsks: new BN(Buffer.from(data.subarray(offset + 48, offset + 56)).reverse()),
  };
}

export async function getDriftUserAccount(
  connection: Connection,
  authority: PublicKeyType,
  subAccountNumber = 0
): Promise<DriftUserAccountInfo | null> {
  const userPda = deriveUserPDA(authority, subAccountNumber);

  try {
    const accountInfo = await connection.getAccountInfo(userPda);

    if (!accountInfo || accountInfo.data.length < DRIFT_USER_ACCOUNT_SIZE) {
      return null;
    }

    const data = accountInfo.data;

    const authorityBytes = data.subarray(8, 40);
    const { PublicKey } = await import("@solana/web3.js");
    const accountAuthority = new PublicKey(authorityBytes);

    const subAccountId = data.readUInt16LE(40);

    const nameBytes = data.subarray(42, 74);
    const name = Buffer.from(nameBytes).toString("utf8").replace(/\0/g, "");

    const orders: DriftUserOrder[] = [];
    for (let i = 0; i < ORDERS_COUNT; i++) {
      const orderOffset = ORDERS_OFFSET + i * ORDER_SIZE;
      const order = decodeOrder(data, orderOffset);
      if (order.status > 0) {
        orders.push(order);
      }
    }

    const perpPositions: DriftPerpPosition[] = [];
    for (let i = 0; i < PERP_POSITIONS_COUNT; i++) {
      const posOffset = PERP_POSITIONS_OFFSET + i * PERP_POSITION_SIZE;
      const position = decodePerpPosition(data, posOffset);
      if (!position.baseAssetAmount.isZero() || position.openOrders > 0) {
        perpPositions.push(position);
      }
    }

    return {
      authority: accountAuthority,
      subAccountId,
      name,
      orders,
      perpPositions,
    };
  } catch (error) {
    console.error("[DriftVerification] Failed to fetch Drift user account:", error);
    return null;
  }
}

export async function getDriftUserOrders(
  connection: Connection,
  authority: PublicKeyType,
  subAccountNumber = 0
): Promise<DriftUserOrder[]> {
  const userAccount = await getDriftUserAccount(connection, authority, subAccountNumber);
  return userAccount?.orders ?? [];
}

export async function getDriftUserPositions(
  connection: Connection,
  authority: PublicKeyType,
  subAccountNumber = 0
): Promise<DriftPerpPosition[]> {
  const userAccount = await getDriftUserAccount(connection, authority, subAccountNumber);
  return userAccount?.perpPositions ?? [];
}

export function verifyOrderExists(
  orders: DriftUserOrder[],
  expectedParams: {
    marketIndex?: number;
    direction?: number;
    baseAssetAmount?: BN;
    orderType?: number;
    reduceOnly?: boolean;
  }
): DriftUserOrder | null {
  return orders.find((order) => {
    if (expectedParams.marketIndex !== undefined && order.marketIndex !== expectedParams.marketIndex) {
      return false;
    }
    if (expectedParams.direction !== undefined && order.direction !== expectedParams.direction) {
      return false;
    }
    if (expectedParams.baseAssetAmount !== undefined && !order.baseAssetAmount.eq(expectedParams.baseAssetAmount)) {
      return false;
    }
    if (expectedParams.orderType !== undefined && order.orderType !== expectedParams.orderType) {
      return false;
    }
    if (expectedParams.reduceOnly !== undefined && order.reduceOnly !== expectedParams.reduceOnly) {
      return false;
    }
    return true;
  }) ?? null;
}

export function verifyPositionChange(
  positionsBefore: DriftPerpPosition[],
  positionsAfter: DriftPerpPosition[],
  marketIndex: number
): { changed: boolean; delta: BN } {
  const before = positionsBefore.find((p) => p.marketIndex === marketIndex);
  const after = positionsAfter.find((p) => p.marketIndex === marketIndex);

  const beforeAmount = before?.baseAssetAmount ?? new BN(0);
  const afterAmount = after?.baseAssetAmount ?? new BN(0);

  const delta = afterAmount.sub(beforeAmount);

  return {
    changed: !delta.isZero(),
    delta,
  };
}

export async function isDriftUserInitialized(
  connection: Connection,
  authority: PublicKeyType,
  subAccountNumber = 0
): Promise<boolean> {
  const userPda = deriveUserPDA(authority, subAccountNumber);

  try {
    const accountInfo = await connection.getAccountInfo(userPda);
    return accountInfo !== null && accountInfo.data.length >= DRIFT_USER_ACCOUNT_SIZE;
  } catch {
    return false;
  }
}

const DRIFT_USER_STATS_ACCOUNT_SIZE = 144;

export async function isDriftUserStatsInitialized(
  connection: Connection,
  authority: PublicKeyType
): Promise<boolean> {
  const userStatsPda = deriveUserStatsPDA(authority);

  try {
    const accountInfo = await connection.getAccountInfo(userStatsPda);
    return (
      accountInfo !== null &&
      accountInfo.data.length >= DRIFT_USER_STATS_ACCOUNT_SIZE &&
      accountInfo.owner.toBase58() === DRIFT_PROGRAM_ID.toBase58()
    );
  } catch {
    return false;
  }
}

export function getDriftAccountPDAs(
  authority: PublicKeyType,
  marketIndex: number,
  subAccountNumber = 0
): {
  userPda: PublicKeyType;
  userStatsPda: PublicKeyType;
  perpMarketPda: PublicKeyType;
  statePda: PublicKeyType;
  oraclePda: PublicKeyType | null;
} {
  return {
    userPda: deriveUserPDA(authority, subAccountNumber),
    userStatsPda: deriveUserStatsPDA(authority),
    perpMarketPda: derivePerpMarketPDA(marketIndex),
    statePda: deriveStatePDA(),
    oraclePda: PERP_MARKET_ORACLE_ADDRESSES[marketIndex] ?? null,
  };
}

export { DRIFT_PROGRAM_ID };
