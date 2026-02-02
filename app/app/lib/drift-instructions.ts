/**
 * Drift Protocol V2 Instruction Builders
 *
 * These instruction builders are designed to match the Drift V2 program's
 * expected instruction format. The encoding follows Drift's IDL specification.
 *
 * IMPORTANT: Drift is an Anchor program, so all instructions use 8-byte
 * discriminators computed as sha256("global:<instruction_name>")[0..8].
 *
 * Data Encoding:
 * - All integers are little-endian
 * - BN values use 8-byte LE representation
 * - Market indices are 2-byte u16 LE
 * - Booleans are 1-byte (0 = false, 1 = true)
 *
 * Reference: https://github.com/drift-labs/protocol-v2/blob/master/programs/drift/src/lib.rs
 *
 * IMPORTANT: These builders construct simplified instruction data.
 * For production use with complex order types, consider using the official
 * @drift-labs/sdk which handles full Borsh serialization and all edge cases.
 */

import { BN } from "@coral-xyz/anchor";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { createHash } from "crypto";

export const DRIFT_PROGRAM_ID = new PublicKey(
  "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH"
);

function anchorDiscriminator(instructionName: string): Buffer {
  const hash = createHash("sha256")
    .update(`global:${instructionName}`)
    .digest();
  return Buffer.from(hash.subarray(0, 8));
}

export const DRIFT_ANCHOR_DISCRIMINATORS = {
  INITIALIZE_USER: anchorDiscriminator("initialize_user"),
  INITIALIZE_USER_STATS: anchorDiscriminator("initialize_user_stats"),
  DEPOSIT: anchorDiscriminator("deposit"),
  WITHDRAW: anchorDiscriminator("withdraw"),
  PLACE_PERP_ORDER: anchorDiscriminator("place_perp_order"),
  CANCEL_ORDER: anchorDiscriminator("cancel_order"),
  SETTLE_PNL: anchorDiscriminator("settle_pnl"),
} as const;

const USER_SEED = "user";
const USER_STATS_SEED = "user_stats";

export function deriveUserPDA(
  authority: PublicKey,
  subAccountNumber: number = 0
): PublicKey {
  const subAccountBuffer = Buffer.alloc(2);
  subAccountBuffer.writeUInt16LE(subAccountNumber);

  const [userPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from(USER_SEED), authority.toBuffer(), subAccountBuffer],
    DRIFT_PROGRAM_ID
  );

  return userPDA;
}

export function deriveUserStatsPDA(authority: PublicKey): PublicKey {
  const [userStatsPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from(USER_STATS_SEED), authority.toBuffer()],
    DRIFT_PROGRAM_ID
  );

  return userStatsPDA;
}

export function deriveSpotMarketVaultPDA(spotMarketIndex: number): PublicKey {
  const marketIndexBuffer = Buffer.alloc(2);
  marketIndexBuffer.writeUInt16LE(spotMarketIndex);

  const [vaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("spot_market_vault"), marketIndexBuffer],
    DRIFT_PROGRAM_ID
  );

  return vaultPDA;
}

export function derivePerpMarketPDA(marketIndex: number): PublicKey {
  const marketIndexBuffer = Buffer.alloc(2);
  marketIndexBuffer.writeUInt16LE(marketIndex);

  const [perpMarketPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("perp_market"), marketIndexBuffer],
    DRIFT_PROGRAM_ID
  );

  return perpMarketPDA;
}

export function deriveSpotMarketPDA(spotMarketIndex: number): PublicKey {
  const marketIndexBuffer = Buffer.alloc(2);
  marketIndexBuffer.writeUInt16LE(spotMarketIndex);

  const [spotMarketPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("spot_market"), marketIndexBuffer],
    DRIFT_PROGRAM_ID
  );

  return spotMarketPDA;
}

export function deriveStatePDA(): PublicKey {
  const [statePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("drift_state")],
    DRIFT_PROGRAM_ID
  );

  return statePDA;
}

export interface InitializeUserStatsParams {
  authority: PublicKey;
  payer: PublicKey;
}

export function buildInitializeUserStatsInstruction(
  params: InitializeUserStatsParams
): TransactionInstruction {
  const { authority, payer } = params;

  const userStatsPDA = deriveUserStatsPDA(authority);
  const statePDA = deriveStatePDA();

  const discriminator = DRIFT_ANCHOR_DISCRIMINATORS.INITIALIZE_USER_STATS;
  const data = Buffer.alloc(8);
  discriminator.copy(data, 0);

  return new TransactionInstruction({
    programId: DRIFT_PROGRAM_ID,
    keys: [
      { pubkey: userStatsPDA, isSigner: false, isWritable: true },
      { pubkey: statePDA, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: true },
      {
        pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"),
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: new PublicKey("11111111111111111111111111111111"),
        isSigner: false,
        isWritable: false,
      },
    ],
    data,
  });
}

export interface InitializeUserParams {
  authority: PublicKey;
  payer: PublicKey;
  subAccountNumber?: number;
  name?: string;
}

export function buildInitializeUserInstruction(
  params: InitializeUserParams
): TransactionInstruction {
  const { authority, payer, subAccountNumber = 0, name = "" } = params;

  const userPDA = deriveUserPDA(authority, subAccountNumber);
  const userStatsPDA = deriveUserStatsPDA(authority);
  const statePDA = deriveStatePDA();

  const nameBytes = Buffer.alloc(32);
  if (name) {
    const nameBuffer = Buffer.from(name.slice(0, 32));
    nameBuffer.copy(nameBytes);
  }

  const discriminator = DRIFT_ANCHOR_DISCRIMINATORS.INITIALIZE_USER;
  const data = Buffer.alloc(8 + 2 + 32);
  let offset = 0;

  discriminator.copy(data, offset);
  offset += 8;

  data.writeUInt16LE(subAccountNumber, offset);
  offset += 2;

  nameBytes.copy(data, offset);

  return new TransactionInstruction({
    programId: DRIFT_PROGRAM_ID,
    keys: [
      { pubkey: userPDA, isSigner: false, isWritable: true },
      { pubkey: userStatsPDA, isSigner: false, isWritable: true },
      { pubkey: statePDA, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: true },
      {
        pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"),
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: new PublicKey("11111111111111111111111111111111"),
        isSigner: false,
        isWritable: false,
      },
    ],
    data,
  });
}

export interface DepositParams {
  amount: BN;
  spotMarketIndex: number;
  userPDA: PublicKey;
  authority: PublicKey;
  tokenAccount: PublicKey;
  reduceOnly?: boolean;
}

export function buildDepositInstruction(
  params: DepositParams
): TransactionInstruction {
  const {
    amount,
    spotMarketIndex,
    userPDA,
    authority,
    tokenAccount,
    reduceOnly = false,
  } = params;

  const userStatsPDA = deriveUserStatsPDA(authority);
  const statePDA = deriveStatePDA();
  const spotMarketPDA = deriveSpotMarketPDA(spotMarketIndex);
  const spotMarketVault = deriveSpotMarketVaultPDA(spotMarketIndex);

  const discriminator = DRIFT_ANCHOR_DISCRIMINATORS.DEPOSIT;
  const data = Buffer.alloc(8 + 2 + 8 + 1);
  let offset = 0;

  discriminator.copy(data, offset);
  offset += 8;

  data.writeUInt16LE(spotMarketIndex, offset);
  offset += 2;

  amount.toArrayLike(Buffer, "le", 8).copy(data, offset);
  offset += 8;

  data.writeUInt8(reduceOnly ? 1 : 0, offset);

  return new TransactionInstruction({
    programId: DRIFT_PROGRAM_ID,
    keys: [
      { pubkey: statePDA, isSigner: false, isWritable: false },
      { pubkey: userPDA, isSigner: false, isWritable: true },
      { pubkey: userStatsPDA, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: spotMarketVault, isSigner: false, isWritable: true },
      { pubkey: tokenAccount, isSigner: false, isWritable: true },
      { pubkey: spotMarketPDA, isSigner: false, isWritable: true },
      {
        pubkey: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        isSigner: false,
        isWritable: false,
      },
    ],
    data,
  });
}

export interface WithdrawParams {
  amount: BN;
  spotMarketIndex: number;
  userPDA: PublicKey;
  authority: PublicKey;
  tokenAccount: PublicKey;
  reduceOnly?: boolean;
}

export function buildWithdrawInstruction(
  params: WithdrawParams
): TransactionInstruction {
  const {
    amount,
    spotMarketIndex,
    userPDA,
    authority,
    tokenAccount,
    reduceOnly = false,
  } = params;

  const userStatsPDA = deriveUserStatsPDA(authority);
  const statePDA = deriveStatePDA();
  const spotMarketPDA = deriveSpotMarketPDA(spotMarketIndex);
  const spotMarketVault = deriveSpotMarketVaultPDA(spotMarketIndex);

  const [driftSigner] = PublicKey.findProgramAddressSync(
    [Buffer.from("drift_signer")],
    DRIFT_PROGRAM_ID
  );

  const discriminator = DRIFT_ANCHOR_DISCRIMINATORS.WITHDRAW;
  const data = Buffer.alloc(8 + 2 + 8 + 1);
  let offset = 0;

  discriminator.copy(data, offset);
  offset += 8;

  data.writeUInt16LE(spotMarketIndex, offset);
  offset += 2;

  amount.toArrayLike(Buffer, "le", 8).copy(data, offset);
  offset += 8;

  data.writeUInt8(reduceOnly ? 1 : 0, offset);

  return new TransactionInstruction({
    programId: DRIFT_PROGRAM_ID,
    keys: [
      { pubkey: statePDA, isSigner: false, isWritable: false },
      { pubkey: userPDA, isSigner: false, isWritable: true },
      { pubkey: userStatsPDA, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: spotMarketVault, isSigner: false, isWritable: true },
      { pubkey: driftSigner, isSigner: false, isWritable: false },
      { pubkey: tokenAccount, isSigner: false, isWritable: true },
      { pubkey: spotMarketPDA, isSigner: false, isWritable: true },
      {
        pubkey: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        isSigner: false,
        isWritable: false,
      },
    ],
    data,
  });
}

/**
 * Drift V2 OrderType enum values
 *
 * These values match the Drift IDL:
 * pub enum OrderType {
 *     Market,          // 0
 *     Limit,           // 1
 *     TriggerMarket,   // 2
 *     TriggerLimit,    // 3
 *     Oracle,          // 4
 * }
 */
export type OrderType =
  | "market"
  | "limit"
  | "triggerMarket"
  | "triggerLimit"
  | "oracle";

/**
 * Drift V2 PositionDirection enum values
 *
 * pub enum PositionDirection {
 *     Long,   // 0
 *     Short,  // 1
 * }
 */
export type PositionDirection = "long" | "short";

export type TriggerCondition = "above" | "below";

export const TRIGGER_CONDITION_VALUES: Record<TriggerCondition, number> = {
  above: 1,
  below: 2,
} as const;

export function inferTriggerCondition(
  type: "stop_loss" | "take_profit",
  side: PositionDirection
): TriggerCondition {
  if (type === "stop_loss") return side === "long" ? "below" : "above";
  return side === "long" ? "above" : "below";
}

export const ORDER_TYPE_VALUES: Record<OrderType, number> = {
  market: 0,
  limit: 1,
  triggerMarket: 2,
  triggerLimit: 3,
  oracle: 4,
} as const;

export const DIRECTION_VALUES: Record<PositionDirection, number> = {
  long: 0,
  short: 1,
} as const;

export interface OpenPerpPositionParams {
  marketIndex: number;
  baseAssetAmount: BN;
  direction: PositionDirection;
  userPDA: PublicKey;
  authority: PublicKey;
  orderType?: OrderType;
  price?: BN;
  reduceOnly?: boolean;
  postOnly?: boolean;
  immediateOrCancel?: boolean;
  oracle?: PublicKey;
}

export interface PlaceTriggerOrderParams {
  marketIndex: number;
  baseAssetAmount: BN;
  direction: PositionDirection;
  triggerPrice: BN;
  triggerCondition: TriggerCondition;
  userPDA: PublicKey;
  authority: PublicKey;
  oracle?: PublicKey;
}

function encodeOrderType(orderType: OrderType): number {
  const value = ORDER_TYPE_VALUES[orderType];
  if (value === undefined) {
    console.warn(`[Drift] Unknown order type: ${orderType}, defaulting to market`);
    return 0;
  }
  return value;
}

function encodeDirection(direction: PositionDirection): number {
  const value = DIRECTION_VALUES[direction];
  if (value === undefined) {
    console.warn(`[Drift] Unknown direction: ${direction}, defaulting to long`);
    return 0;
  }
  return value;
}

/**
 * Build a place_perp_order instruction for opening a perpetual position.
 *
 * Instruction Data Layout (24 bytes):
 * ┌────────┬────────────┬────────────────────────────────────────────┐
 * │ Offset │ Size       │ Field                                      │
 * ├────────┼────────────┼────────────────────────────────────────────┤
 * │ 0      │ 1 byte     │ Instruction discriminator (23)             │
 * │ 1      │ 1 byte     │ Order type enum (0=market, 1=limit, etc)   │
 * │ 2      │ 1 byte     │ Direction enum (0=long, 1=short)           │
 * │ 3      │ 2 bytes    │ Market index (u16 LE)                      │
 * │ 5      │ 8 bytes    │ Base asset amount (u64 LE)                 │
 * │ 13     │ 8 bytes    │ Price (u64 LE, 0 for market orders)        │
 * │ 21     │ 1 byte     │ Reduce only flag (0 or 1)                  │
 * │ 22     │ 1 byte     │ Post only flag (0 or 1)                    │
 * │ 23     │ 1 byte     │ Immediate or cancel flag (0 or 1)          │
 * └────────┴────────────┴────────────────────────────────────────────┘
 *
 * Account Keys:
 * - state: Drift protocol state PDA
 * - user: User account PDA
 * - userStats: User stats PDA
 * - authority: Wallet signing the transaction
 * - perpMarket: Perp market account PDA
 * - oracle: Pyth oracle for the market (required for price validation)
 *
 * Note: This is a simplified encoding for basic market/limit orders.
 * Complex order types (triggers, oracles) may require additional fields.
 */
export function buildOpenPerpPositionInstruction(
  params: OpenPerpPositionParams
): TransactionInstruction {
  const {
    marketIndex,
    baseAssetAmount,
    direction,
    userPDA,
    authority,
    orderType = "market",
    price,
    reduceOnly = false,
    postOnly = false,
    immediateOrCancel = false,
    oracle,
  } = params;

  if (marketIndex < 0 || marketIndex > 65535) {
    throw new Error(`Invalid market index: ${marketIndex}. Must be 0-65535.`);
  }

  if (baseAssetAmount.lten(0)) {
    throw new Error("Base asset amount must be positive");
  }

  if (postOnly && immediateOrCancel) {
    throw new Error("Cannot use both postOnly and immediateOrCancel flags");
  }

  const oracleAddress = oracle ?? PERP_MARKET_ORACLE_ADDRESSES[marketIndex];
  if (!oracleAddress) {
    throw new Error(
      `No oracle address found for market index ${marketIndex}. ` +
      `Provide oracle parameter or add to PERP_MARKET_ORACLE_ADDRESSES.`
    );
  }

  const userStatsPDA = deriveUserStatsPDA(authority);
  const statePDA = deriveStatePDA();
  const perpMarketPDA = derivePerpMarketPDA(marketIndex);

  const marketIndexBuffer = Buffer.alloc(2);
  marketIndexBuffer.writeUInt16LE(marketIndex);

  const baseAssetAmountBuffer = baseAssetAmount.toArrayLike(Buffer, "le", 8);

  const priceBuffer = price
    ? price.toArrayLike(Buffer, "le", 8)
    : Buffer.alloc(8);

  const discriminator = DRIFT_ANCHOR_DISCRIMINATORS.PLACE_PERP_ORDER;
  const data = Buffer.alloc(8 + 1 + 1 + 2 + 8 + 8 + 1 + 1 + 1);
  let offset = 0;

  discriminator.copy(data, offset);
  offset += 8;

  data.writeUInt8(encodeOrderType(orderType), offset);
  offset += 1;

  data.writeUInt8(encodeDirection(direction), offset);
  offset += 1;

  marketIndexBuffer.copy(data, offset);
  offset += 2;

  baseAssetAmountBuffer.copy(data, offset);
  offset += 8;

  priceBuffer.copy(data, offset);
  offset += 8;

  data.writeUInt8(reduceOnly ? 1 : 0, offset);
  offset += 1;

  data.writeUInt8(postOnly ? 1 : 0, offset);
  offset += 1;

  data.writeUInt8(immediateOrCancel ? 1 : 0, offset);

  return new TransactionInstruction({
    programId: DRIFT_PROGRAM_ID,
    keys: [
      { pubkey: statePDA, isSigner: false, isWritable: false },
      { pubkey: userPDA, isSigner: false, isWritable: true },
      { pubkey: userStatsPDA, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: perpMarketPDA, isSigner: false, isWritable: true },
      { pubkey: oracleAddress, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Build a place_perp_order instruction for a trigger market reduce-only order.
 *
 * This uses the same discriminator (23) as open/close orders but appends trigger
 * fields after the base 24-byte layout:
 * - triggerPrice (u64 LE) at offset 24
 * - triggerCondition (u8) at offset 32
 */
export function buildPlaceTriggerOrderInstruction(
  params: PlaceTriggerOrderParams
): TransactionInstruction {
  const {
    marketIndex,
    baseAssetAmount,
    direction,
    triggerPrice,
    triggerCondition,
    userPDA,
    authority,
    oracle,
  } = params;

  if (marketIndex < 0 || marketIndex > 65535) {
    throw new Error(`Invalid market index: ${marketIndex}. Must be 0-65535.`);
  }

  if (baseAssetAmount.lten(0)) {
    throw new Error("Base asset amount must be positive");
  }

  const oracleAddress = oracle ?? PERP_MARKET_ORACLE_ADDRESSES[marketIndex];
  if (!oracleAddress) {
    throw new Error(
      `No oracle address found for market index ${marketIndex}. ` +
        `Provide oracle parameter or add to PERP_MARKET_ORACLE_ADDRESSES.`
    );
  }

  const userStatsPDA = deriveUserStatsPDA(authority);
  const statePDA = deriveStatePDA();
  const perpMarketPDA = derivePerpMarketPDA(marketIndex);

  const marketIndexBuffer = Buffer.alloc(2);
  marketIndexBuffer.writeUInt16LE(marketIndex);

  const baseAssetAmountBuffer = baseAssetAmount.toArrayLike(Buffer, "le", 8);
  const priceBuffer = Buffer.alloc(8); // 0 for triggerMarket
  const triggerPriceBuffer = triggerPrice.toArrayLike(Buffer, "le", 8);

  const triggerConditionValue = TRIGGER_CONDITION_VALUES[triggerCondition];
  if (triggerConditionValue === undefined) {
    throw new Error(`Invalid trigger condition: ${triggerCondition}`);
  }

  const discriminator = DRIFT_ANCHOR_DISCRIMINATORS.PLACE_PERP_ORDER;
  const data = Buffer.alloc(8 + 1 + 1 + 2 + 8 + 8 + 1 + 1 + 1 + 8 + 1);
  let offset = 0;

  discriminator.copy(data, offset);
  offset += 8;

  data.writeUInt8(ORDER_TYPE_VALUES.triggerMarket, offset);
  offset += 1;

  data.writeUInt8(encodeDirection(direction), offset);
  offset += 1;

  marketIndexBuffer.copy(data, offset);
  offset += 2;

  baseAssetAmountBuffer.copy(data, offset);
  offset += 8;

  priceBuffer.copy(data, offset);
  offset += 8;

  // reduceOnly = true
  data.writeUInt8(1, offset);
  offset += 1;

  // postOnly = false
  data.writeUInt8(0, offset);
  offset += 1;

  // immediateOrCancel = false
  data.writeUInt8(0, offset);
  offset += 1;

  // Trigger extensions
  triggerPriceBuffer.copy(data, offset);
  offset += 8;

  data.writeUInt8(triggerConditionValue, offset);

  return new TransactionInstruction({
    programId: DRIFT_PROGRAM_ID,
    keys: [
      { pubkey: statePDA, isSigner: false, isWritable: false },
      { pubkey: userPDA, isSigner: false, isWritable: true },
      { pubkey: userStatsPDA, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: perpMarketPDA, isSigner: false, isWritable: true },
      { pubkey: oracleAddress, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export interface ClosePerpPositionParams {
  marketIndex: number;
  userPDA: PublicKey;
  authority: PublicKey;
  baseAssetAmount?: BN;
  limitPrice?: BN;
  oracle?: PublicKey;
}

/**
 * Build a place_perp_order instruction for closing a perpetual position.
 *
 * This uses the same instruction as opening (discriminator 23) but with:
 * - reduce_only = true (forces position reduction)
 * - Direction doesn't matter for reduce_only orders (set to 0)
 *
 * If baseAssetAmount is not provided, it will close the entire position
 * (Drift interprets 0 as "close all" when reduce_only is true).
 *
 * Account Keys:
 * - state: Drift protocol state PDA
 * - user: User account PDA
 * - userStats: User stats PDA
 * - authority: Wallet signing the transaction
 * - perpMarket: Perp market account PDA
 * - oracle: Pyth oracle for the market (required for price validation)
 */
export function buildClosePerpPositionInstruction(
  params: ClosePerpPositionParams
): TransactionInstruction {
  const { marketIndex, userPDA, authority, baseAssetAmount, limitPrice, oracle } =
    params;

  if (marketIndex < 0 || marketIndex > 65535) {
    throw new Error(`Invalid market index: ${marketIndex}. Must be 0-65535.`);
  }

  const oracleAddress = oracle ?? PERP_MARKET_ORACLE_ADDRESSES[marketIndex];
  if (!oracleAddress) {
    throw new Error(
      `No oracle address found for market index ${marketIndex}. ` +
      `Provide oracle parameter or add to PERP_MARKET_ORACLE_ADDRESSES.`
    );
  }

  const userStatsPDA = deriveUserStatsPDA(authority);
  const statePDA = deriveStatePDA();
  const perpMarketPDA = derivePerpMarketPDA(marketIndex);

  const marketIndexBuffer = Buffer.alloc(2);
  marketIndexBuffer.writeUInt16LE(marketIndex);

  const baseAssetAmountBuffer = baseAssetAmount
    ? baseAssetAmount.toArrayLike(Buffer, "le", 8)
    : Buffer.alloc(8);

  const limitPriceBuffer = limitPrice
    ? limitPrice.toArrayLike(Buffer, "le", 8)
    : Buffer.alloc(8);

  const discriminator = DRIFT_ANCHOR_DISCRIMINATORS.PLACE_PERP_ORDER;
  const data = Buffer.alloc(8 + 1 + 1 + 2 + 8 + 8 + 1 + 1);
  let offset = 0;

  discriminator.copy(data, offset);
  offset += 8;

  data.writeUInt8(ORDER_TYPE_VALUES.market, offset);
  offset += 1;

  data.writeUInt8(DIRECTION_VALUES.long, offset);
  offset += 1;

  marketIndexBuffer.copy(data, offset);
  offset += 2;

  baseAssetAmountBuffer.copy(data, offset);
  offset += 8;

  limitPriceBuffer.copy(data, offset);
  offset += 8;

  data.writeUInt8(1, offset);
  offset += 1;

  data.writeUInt8(0, offset);

  return new TransactionInstruction({
    programId: DRIFT_PROGRAM_ID,
    keys: [
      { pubkey: statePDA, isSigner: false, isWritable: false },
      { pubkey: userPDA, isSigner: false, isWritable: true },
      { pubkey: userStatsPDA, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: perpMarketPDA, isSigner: false, isWritable: true },
      { pubkey: oracleAddress, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export interface CancelOrderParams {
  orderId: number;
  userPDA: PublicKey;
  authority: PublicKey;
}

export function buildCancelOrderInstruction(
  params: CancelOrderParams
): TransactionInstruction {
  const { orderId, userPDA, authority } = params;

  const userStatsPDA = deriveUserStatsPDA(authority);
  const statePDA = deriveStatePDA();

  const discriminator = DRIFT_ANCHOR_DISCRIMINATORS.CANCEL_ORDER;
  const data = Buffer.alloc(8 + 4);
  let offset = 0;

  discriminator.copy(data, offset);
  offset += 8;

  data.writeUInt32LE(orderId, offset);

  return new TransactionInstruction({
    programId: DRIFT_PROGRAM_ID,
    keys: [
      { pubkey: statePDA, isSigner: false, isWritable: false },
      { pubkey: userPDA, isSigner: false, isWritable: true },
      { pubkey: userStatsPDA, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data,
  });
}

export const USDC_SPOT_MARKET_INDEX = 0;
export const SOL_SPOT_MARKET_INDEX = 1;

export const SOL_PERP_MARKET_INDEX = 0;
export const BTC_PERP_MARKET_INDEX = 1;
export const ETH_PERP_MARKET_INDEX = 2;

export const QUOTE_PRECISION = new BN(1_000_000);
export const BASE_PRECISION = new BN(1_000_000_000);
export const PRICE_PRECISION = new BN(1_000_000);

/**
 * Pyth Oracle Addresses for Drift Perp Markets (Mainnet)
 *
 * These are the Pyth pull oracle addresses used by Drift Protocol.
 * The oracle account must be included in remaining accounts for perp orders
 * so the program can validate prices and calculate margin requirements.
 */
export const PERP_MARKET_ORACLE_ADDRESSES: Record<number, PublicKey> = {
  // SOL-PERP (index 0) - Pyth SOL/USD
  0: new PublicKey("H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG"),
  // BTC-PERP (index 1) - Pyth BTC/USD
  1: new PublicKey("GVXRSBjFk6e6J3NbVPXohDJetcTjaeeuykUpbQF8UoMU"),
  // ETH-PERP (index 2) - Pyth ETH/USD
  2: new PublicKey("JBu1AL4obBcCMqKBBxhpWCNUt136ijcuMZLFvTP7iWdB"),
  // APT-PERP (index 3) - Pyth APT/USD
  3: new PublicKey("FNNvb1AFDnDVPkocEri8mWbJ1952HQZtFLuwPiUjSJQ"),
  // BONK-PERP (index 4) - Pyth BONK/USD
  4: new PublicKey("8ihFLu5FimgTQ1Unh4dVyEHUGodJ5gJQCrQf4KUVB9bN"),
  // MATIC-PERP (index 5) - Pyth MATIC/USD
  5: new PublicKey("7KVswB9vkCgeM3SHP7aGDijvdRAHK8P5wi9JXViCrtYh"),
  // ARB-PERP (index 6) - Pyth ARB/USD
  6: new PublicKey("36cjSZAGUoHLkcMd6z4pNLYyCaaSPQby8JrHT3DQLAZA"),
  // DOGE-PERP (index 7) - Pyth DOGE/USD
  7: new PublicKey("FsSM3s38PX9K7Dn6eGzuE29S2Dsk1Sss1baytTQdCaQj"),
  // BNB-PERP (index 8) - Pyth BNB/USD
  8: new PublicKey("4CkQJBxhU8EZ2UjhigbtdaPbpTe6mqf811fipYBFbSYN"),
  // SUI-PERP (index 9) - Pyth SUI/USD
  9: new PublicKey("3Qub3HaAJaa2xNY7SUqPKd3vVwTqDfDDkEUMPjXD2c1q"),
  // PEPE-PERP (index 10) - Pyth PEPE/USD
  10: new PublicKey("FSfxunDmjjbDV2QxpyxFCAPKmYJHSLnLuvQXDLkMzLBm"),
  // OP-PERP (index 11) - Pyth OP/USD
  11: new PublicKey("4o4CUwzFwLqCvmA5x1G4VzoZkAhAcbiuiYyjWX1CVbY2"),
  // RENDER-PERP (index 12) - Pyth RENDER/USD
  12: new PublicKey("HAm5DZhrgrWa12heKSxocQRyJWjHxpJkTh1Kd4Kkp4Du"),
  // XRP-PERP (index 13) - Pyth XRP/USD
  13: new PublicKey("4Pc4BLrdJiCWGPEVKYCZWDCz8TnvP5yRqTJAB7AdBqNE"),
  // HNT-PERP (index 14) - Pyth HNT/USD
  14: new PublicKey("7moA1i5vQUpfDwSpK6Pw9s56ahB7WFGidtbL2ujWrVvm"),
  // INJ-PERP (index 15) - Pyth INJ/USD
  15: new PublicKey("9EdtbaivHQYA4Nh3XzGR6DwRaoorqXYnmpfsnFhvwuVj"),
  // LINK-PERP (index 16) - Pyth LINK/USD
  16: new PublicKey("ALdkqtyNGEVHvPJqvhCZJjFQ4D3G5hSHX5VYHiPaN4Fy"),
  // RLB-PERP (index 17) - Pyth RLB/USD (placeholder - verify address)
  17: new PublicKey("AZrVgHSHsEJTAkLqzCrKxMFRmCLXsGXxMWaH3vbxWMrJ"),
  // PYTH-PERP (index 18) - Pyth PYTH/USD
  18: new PublicKey("nrYkQQQur7z8rYTST3G9GqATviK5SxTDkrqd21MW6Ue"),
  // TIA-PERP (index 19) - Pyth TIA/USD
  19: new PublicKey("funeUsHgi2QKkLdUPASRLuYkaK8JaazCEz3HikbkhVt"),
  // JTO-PERP (index 20) - Pyth JTO/USD
  20: new PublicKey("D8UUgr8a3aR3yUeHLu7v8FWK7E8Y5sSU7qrYBXUJXBQ5"),
  // SEI-PERP (index 21) - Pyth SEI/USD
  21: new PublicKey("6dK2sVNhiqGwKYFLhJzYqKNRgRPDxVjAoYNvPzLnQsWm"),
  // AVAX-PERP (index 22) - Pyth AVAX/USD
  22: new PublicKey("Ax9ujW5B9oqcv59N8m6f1BpTBq2rGeGaBcpKjC5UYsXU"),
  // WIF-PERP (index 23) - Pyth WIF/USD
  23: new PublicKey("6ABgrEZk8urs6kJ1JNdC1sspH5zKXRqxy8sg3ZG2cQps"),
  // JUP-PERP (index 24) - Pyth JUP/USD
  24: new PublicKey("g6eRCbboSwK4tSWngn773RCMexr1APQr4uA9bGZBYfo"),
  // DYM-PERP (index 25) - Pyth DYM/USD
  25: new PublicKey("CoJWAqTRF6bnmuXbJMiRGJLSFp9PpvGijSbKZQkX6dBB"),
  // TAO-PERP (index 26) - Pyth TAO/USD
  26: new PublicKey("HwwK1FToGZsNFVT6HdpKoLqUy8qrTRYEvhZCpk4YBi7T"),
  // W-PERP (index 27) - Pyth W/USD
  27: new PublicKey("H9jCvASjwStEJfx8VB3J5ePVr76KyFxSrRkTAxdrMc21"),
  // KMNO-PERP (index 28) - Pyth KMNO/USD
  28: new PublicKey("ArT6K9HwqM8GfqBMU8wPMRhfGZCGHF7wGv5s3fisWcZA"),
  // TNSR-PERP (index 29) - Pyth TNSR/USD
  29: new PublicKey("9TSGDwcPQX4JpAvZbu2Wp5b68wSYkQvHCvfeBjYcCyy"),
  // DRIFT-PERP (index 30) - Pyth DRIFT/USD
  30: new PublicKey("PeNpQeGEm9UEFJ6MBCMauY4WW4h3YqLuNJds9cjjb8K"),
};

/**
 * Spot Market Oracle Addresses (Mainnet)
 */
export const SPOT_MARKET_ORACLE_ADDRESSES: Record<number, PublicKey> = {
  // USDC (index 0) - Uses quote asset oracle (no external oracle needed)
  0: new PublicKey("En8hkHLkRe9d9DraYmBTrus518BvmVH448YcvmrFM6Ce"),
  // SOL (index 1) - Pyth SOL/USD
  1: new PublicKey("H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG"),
};

export function getPerpMarketOracle(marketIndex: number): PublicKey | null {
  return PERP_MARKET_ORACLE_ADDRESSES[marketIndex] ?? null;
}

export function getSpotMarketOracle(marketIndex: number): PublicKey | null {
  return SPOT_MARKET_ORACLE_ADDRESSES[marketIndex] ?? null;
}
