import { createHash } from "crypto";
import { BN } from "@coral-xyz/anchor";

export interface OrderParams {
  marketIndex: number;
  orderSide: "long" | "short";
  baseAssetAmount: BN;
  reduceOnly: boolean;
}

/**
 * Compute the commitment hash for order params.
 * This hash is stored on-chain during order creation.
 * The keeper must provide matching params to execute.
 *
 * Format matches Rust serialization:
 * - market_index: u16 LE
 * - order_side: u8 (0 = long, 1 = short)
 * - base_asset_amount: u64 LE
 * - reduce_only: u8 (0 = false, 1 = true)
 * - nonce: u64 LE
 */
export function computeOrderCommitment(
  params: OrderParams,
  nonce: bigint
): Uint8Array {
  // Serialize params in the same format as Rust
  const buffer = Buffer.alloc(2 + 1 + 8 + 1 + 8);
  let offset = 0;

  // market_index: u16 LE
  buffer.writeUInt16LE(params.marketIndex, offset);
  offset += 2;

  // order_side: u8 (0 = long, 1 = short)
  buffer.writeUInt8(params.orderSide === "long" ? 0 : 1, offset);
  offset += 1;

  // base_asset_amount: u64 LE
  const amountBuf = params.baseAssetAmount.toArrayLike(Buffer, "le", 8);
  amountBuf.copy(buffer, offset);
  offset += 8;

  // reduce_only: u8
  buffer.writeUInt8(params.reduceOnly ? 1 : 0, offset);
  offset += 1;

  // nonce: u64 LE
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(nonce);
  nonceBuf.copy(buffer, offset);

  // SHA256 hash
  const hash = createHash("sha256").update(buffer).digest();
  return new Uint8Array(hash);
}

/**
 * Generate a random nonce for order commitment
 */
export function generateNonce(): bigint {
  const buffer = new Uint8Array(8);
  crypto.getRandomValues(buffer);
  return new DataView(buffer.buffer).getBigUint64(0, true);
}

/**
 * Verify that order params match a commitment
 */
export function verifyCommitment(
  params: OrderParams,
  nonce: bigint,
  commitment: Uint8Array
): boolean {
  const computed = computeOrderCommitment(params, nonce);
  if (computed.length !== commitment.length) return false;
  for (let i = 0; i < computed.length; i++) {
    if (computed[i] !== commitment[i]) return false;
  }
  return true;
}

/**
 * Convert OrderParams to the format expected by the program instruction
 */
export function serializeOrderParams(params: OrderParams): Buffer {
  const buffer = Buffer.alloc(2 + 1 + 8 + 1);
  let offset = 0;

  buffer.writeUInt16LE(params.marketIndex, offset);
  offset += 2;

  buffer.writeUInt8(params.orderSide === "long" ? 0 : 1, offset);
  offset += 1;

  params.baseAssetAmount.toArrayLike(Buffer, "le", 8).copy(buffer, offset);
  offset += 8;

  buffer.writeUInt8(params.reduceOnly ? 1 : 0, offset);

  return buffer;
}

/**
 * Create a commitment and nonce pair for a new ghost order
 */
export function createOrderCommitment(params: OrderParams): {
  commitment: Uint8Array;
  nonce: bigint;
} {
  const nonce = generateNonce();
  const commitment = computeOrderCommitment(params, nonce);
  return { commitment, nonce };
}
