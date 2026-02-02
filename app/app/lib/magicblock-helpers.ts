/**
 * MagicBlock Ephemeral Rollups Helper Library
 *
 * This module provides utilities for interacting with MagicBlock's Ephemeral Rollups (ER)
 * system, including delegation PDAs, transaction helpers, and privacy verification.
 *
 * Key concepts:
 * - Delegation: Transfers account ownership to DELEGATION_PROGRAM_ID
 * - Ephemeral Rollup: High-speed execution layer that processes transactions privately
 * - Commit: Synchronizes ER state back to base layer
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
  TransactionMessage,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  DELEGATION_PROGRAM_ID as SDK_DELEGATION_PROGRAM_ID,
  MAGIC_PROGRAM_ID as SDK_MAGIC_PROGRAM_ID,
  MAGIC_CONTEXT_ID as SDK_MAGIC_CONTEXT_ID,
  createDelegateInstruction,
  createCommitAndUndelegateInstruction,
  createTopUpEscrowInstruction,
  delegationRecordPdaFromDelegatedAccount,
  delegationMetadataPdaFromDelegatedAccount,
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram,
  escrowPdaFromEscrowAuthority,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import { createHash } from "crypto";

export const DEVNET_RPC = "https://api.devnet.solana.com";
export const ER_RPC = "https://devnet.magicblock.app";

export const GHOST_CRANK_PROGRAM_ID = new PublicKey(
  "7VvD7j99AE7q9PC9atpJeMEUeEzZ5ZYH7WqSzGdmvsqv"
);
export const DELEGATION_PROGRAM_ID = SDK_DELEGATION_PROGRAM_ID;
export const MAGIC_PROGRAM_ID = SDK_MAGIC_PROGRAM_ID;
export const MAGIC_CONTEXT_ID = SDK_MAGIC_CONTEXT_ID;

export const DRIFT_PROGRAM_ID = new PublicKey(
  "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH"
);

export const SOL_PYTH_LAZER_FEED = new PublicKey(
  "ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu"
);

export const STATE_PROPAGATION_DELAY_MS = 3000;
export const COMMIT_FREQUENCY_MS = 30000;
export const DEFAULT_ESCROW_LAMPORTS = 0.01 * LAMPORTS_PER_SOL;

export interface DelegationPDAs {
  delegationBuffer: PublicKey;
  delegationRecord: PublicKey;
  delegationMetadata: PublicKey;
}

export interface DualConnections {
  base: Connection;
  er: Connection;
}

export interface GhostOrderState {
  owner: PublicKey;
  orderId: BN;
  marketIndex: number;
  triggerPrice: BN;
  triggerCondition: number;
  orderSide: number;
  baseAssetAmount: BN;
  reduceOnly: boolean;
  status: number;
  createdAt: BN;
  triggeredAt: BN;
  executedAt: BN;
  expiry: BN;
  feedId: number[];
  crankTaskId: BN;
  executionPrice: BN;
  bump: number;
}

export const ORDER_STATUS = {
  Pending: 0,
  Active: 1,
  Triggered: 2,
  Executed: 3,
  Cancelled: 4,
  Expired: 5,
} as const;

export const TRIGGER_CONDITION = {
  Above: 0,
  Below: 1,
} as const;

export const ORDER_SIDE = {
  Long: 0,
  Short: 1,
} as const;

export function statusToString(status: number): string {
  const statusNames = ["Pending", "Active", "Triggered", "Executed", "Cancelled", "Expired"];
  return statusNames[status] ?? `Unknown(${status})`;
}

export function createDualConnections(): DualConnections {
  const base = new Connection(DEVNET_RPC, "confirmed");
  const er = new Connection(ER_RPC, {
    commitment: "confirmed",
    wsEndpoint: ER_RPC.replace("https://", "wss://"),
  });
  return { base, er };
}

export function anchorDiscriminator(instructionName: string): Buffer {
  const hash = createHash("sha256")
    .update(`global:${instructionName}`)
    .digest();
  return Buffer.from(hash.subarray(0, 8));
}

export function deriveDelegationPDAs(
  accountPubkey: PublicKey,
  ownerProgramId: PublicKey
): DelegationPDAs {
  const delegationBuffer = delegateBufferPdaFromDelegatedAccountAndOwnerProgram(
    accountPubkey,
    ownerProgramId
  );
  const delegationRecord = delegationRecordPdaFromDelegatedAccount(accountPubkey);
  const delegationMetadata = delegationMetadataPdaFromDelegatedAccount(accountPubkey);

  return {
    delegationBuffer,
    delegationRecord,
    delegationMetadata,
  };
}

export function deriveGhostOrderPDA(owner: PublicKey, orderId: BN): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("ghost_order"),
      owner.toBuffer(),
      orderId.toArrayLike(Buffer, "le", 8),
    ],
    GHOST_CRANK_PROGRAM_ID
  );
  return pda;
}

export function deriveEscrowPDA(sessionAuthority: PublicKey): PublicKey {
  return escrowPdaFromEscrowAuthority(sessionAuthority);
}

export async function sendBaseLayerTransaction(
  connection: Connection,
  transaction: Transaction | VersionedTransaction,
  signers: Keypair[]
): Promise<string> {
  if (transaction instanceof Transaction) {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = signers[0].publicKey;
    transaction.sign(...signers);

    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    const confirmation = await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed"
    );

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    return signature;
  } else {
    const signature = await connection.sendTransaction(transaction, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    await connection.confirmTransaction(signature, "confirmed");
    return signature;
  }
}

export async function sendERTransaction(
  erConnection: Connection,
  transaction: Transaction,
  sessionKeypair: Keypair
): Promise<string> {
  const { blockhash } = await erConnection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = sessionKeypair.publicKey;
  transaction.sign(sessionKeypair);

  const signature = await erConnection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: true,
    preflightCommitment: "confirmed",
  });

  await erConnection.confirmTransaction(signature, "confirmed");
  return signature;
}

export async function waitForStatePropagation(delayMs = STATE_PROPAGATION_DELAY_MS): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function verifyAccountDelegated(
  connection: Connection,
  accountPubkey: PublicKey
): Promise<{ isDelegated: boolean; owner: PublicKey | null }> {
  const accountInfo = await connection.getAccountInfo(accountPubkey);

  if (!accountInfo) {
    return { isDelegated: false, owner: null };
  }

  const isDelegated = accountInfo.owner.equals(DELEGATION_PROGRAM_ID);
  return { isDelegated, owner: accountInfo.owner };
}

export async function fetchGhostOrderState(
  connection: Connection,
  pda: PublicKey
): Promise<GhostOrderState | null> {
  try {
    const accountInfo = await connection.getAccountInfo(pda);
    if (!accountInfo) return null;

    const data = accountInfo.data;
    if (data.length < 151) return null;

    let offset = 8;

    const owner = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    const orderId = new BN(data.subarray(offset, offset + 8), "le");
    offset += 8;

    const marketIndex = data.readUInt16LE(offset);
    offset += 2;

    const triggerPrice = new BN(data.subarray(offset, offset + 8), "le");
    offset += 8;

    const triggerCondition = data.readUInt8(offset);
    offset += 1;

    const orderSide = data.readUInt8(offset);
    offset += 1;

    const baseAssetAmount = new BN(data.subarray(offset, offset + 8), "le");
    offset += 8;

    const reduceOnly = data.readUInt8(offset) === 1;
    offset += 1;

    const status = data.readUInt8(offset);
    offset += 1;

    const createdAt = new BN(data.subarray(offset, offset + 8), "le");
    offset += 8;

    const triggeredAt = new BN(data.subarray(offset, offset + 8), "le");
    offset += 8;

    const executedAt = new BN(data.subarray(offset, offset + 8), "le");
    offset += 8;

    const expiry = new BN(data.subarray(offset, offset + 8), "le");
    offset += 8;

    const feedId = Array.from(data.subarray(offset, offset + 32));
    offset += 32;

    const crankTaskId = new BN(data.subarray(offset, offset + 8), "le");
    offset += 8;

    const executionPrice = new BN(data.subarray(offset, offset + 8), "le");
    offset += 8;

    const bump = data.readUInt8(offset);

    return {
      owner,
      orderId,
      marketIndex,
      triggerPrice,
      triggerCondition,
      orderSide,
      baseAssetAmount,
      reduceOnly,
      status,
      createdAt,
      triggeredAt,
      executedAt,
      expiry,
      feedId,
      crankTaskId,
      executionPrice,
      bump,
    };
  } catch (error) {
    console.error("[MagicBlock] Failed to fetch ghost order state:", error);
    return null;
  }
}

export interface PrivacyVerificationResult {
  privacyMaintained: boolean;
  erStatus: number | null;
  baseStatus: number | null;
  erAccountExists: boolean;
  baseAccountExists: boolean;
  baseAccountDelegated: boolean;
}

export async function verifyPrivacy(
  connections: DualConnections,
  pda: PublicKey,
  expectedERStatus: number
): Promise<PrivacyVerificationResult> {
  const erState = await fetchGhostOrderState(connections.er, pda);
  const baseState = await fetchGhostOrderState(connections.base, pda);

  const erAccountExists = erState !== null;
  const baseAccountExists = baseState !== null;

  const { isDelegated: baseAccountDelegated } = await verifyAccountDelegated(
    connections.base,
    pda
  );

  const privacyMaintained =
    (!baseAccountExists || baseAccountDelegated || baseState?.status === ORDER_STATUS.Pending) &&
    (erState?.status === expectedERStatus || !erAccountExists);

  return {
    privacyMaintained,
    erStatus: erState?.status ?? null,
    baseStatus: baseState?.status ?? null,
    erAccountExists,
    baseAccountExists,
    baseAccountDelegated,
  };
}

export function encodeCreateGhostOrderArgs(args: {
  orderId: BN;
  marketIndex: number;
  triggerPrice: BN;
  triggerCondition: number;
  orderSide: number;
  baseAssetAmount: BN;
  reduceOnly: boolean;
  expirySeconds: BN;
  feedId: number[];
  paramsCommitment: number[];
  nonce: BN;
  driftUser: PublicKey;
}): Buffer {
  const buf = Buffer.alloc(8 + 2 + 8 + 1 + 1 + 8 + 1 + 8 + 32 + 32 + 8 + 32);
  let offset = 0;

  args.orderId.toArrayLike(Buffer, "le", 8).copy(buf, offset);
  offset += 8;

  buf.writeUInt16LE(args.marketIndex, offset);
  offset += 2;

  args.triggerPrice.toArrayLike(Buffer, "le", 8).copy(buf, offset);
  offset += 8;

  buf.writeUInt8(args.triggerCondition, offset);
  offset += 1;

  buf.writeUInt8(args.orderSide, offset);
  offset += 1;

  args.baseAssetAmount.toArrayLike(Buffer, "le", 8).copy(buf, offset);
  offset += 8;

  buf.writeUInt8(args.reduceOnly ? 1 : 0, offset);
  offset += 1;

  args.expirySeconds.toArrayLike(Buffer, "le", 8).copy(buf, offset);
  offset += 8;

  Buffer.from(args.feedId).copy(buf, offset);
  offset += 32;

  Buffer.from(args.paramsCommitment).copy(buf, offset);
  offset += 32;

  args.nonce.toArrayLike(Buffer, "le", 8).copy(buf, offset);
  offset += 8;

  args.driftUser.toBuffer().copy(buf, offset);

  return buf;
}

export function buildCreateGhostOrderInstruction(
  owner: PublicKey,
  ghostOrderPda: PublicKey,
  args: {
    orderId: BN;
    marketIndex: number;
    triggerPrice: BN;
    triggerCondition: number;
    orderSide: number;
    baseAssetAmount: BN;
    reduceOnly: boolean;
    expirySeconds: BN;
    feedId: number[];
    paramsCommitment: number[];
    nonce: BN;
    driftUser: PublicKey;
  }
): TransactionInstruction {
  const { SystemProgram } = require("@solana/web3.js");

  const discriminator = anchorDiscriminator("create_ghost_order");
  const argsData = encodeCreateGhostOrderArgs(args);
  const data = Buffer.concat([discriminator, argsData]);

  return new TransactionInstruction({
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: ghostOrderPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: GHOST_CRANK_PROGRAM_ID,
    data,
  });
}

export function buildActivateOrderInstruction(
  owner: PublicKey,
  ghostOrderPda: PublicKey
): TransactionInstruction {
  const discriminator = anchorDiscriminator("activate_order");

  return new TransactionInstruction({
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: ghostOrderPda, isSigner: false, isWritable: true },
    ],
    programId: GHOST_CRANK_PROGRAM_ID,
    data: discriminator,
  });
}

export function buildCheckTriggerInstruction(
  ghostOrderPda: PublicKey,
  priceFeed: PublicKey
): TransactionInstruction {
  const discriminator = anchorDiscriminator("check_trigger");

  return new TransactionInstruction({
    keys: [
      { pubkey: ghostOrderPda, isSigner: false, isWritable: true },
      { pubkey: priceFeed, isSigner: false, isWritable: false },
    ],
    programId: GHOST_CRANK_PROGRAM_ID,
    data: discriminator,
  });
}

export interface ExecuteTriggerAccounts {
  payer: PublicKey;
  ghostOrderPda: PublicKey;
  driftStatePda: PublicKey;
  driftUserPda: PublicKey;
  driftUserStatsPda: PublicKey;
  driftAuthority: PublicKey;
  perpMarketPda: PublicKey;
  oraclePda: PublicKey;
}

export function buildExecuteTriggerInstruction(
  accounts: ExecuteTriggerAccounts,
  redelegateAfterExecution = false
): TransactionInstruction {
  const discriminator = anchorDiscriminator("execute_trigger");

  const argsData = Buffer.alloc(1);
  argsData.writeUInt8(redelegateAfterExecution ? 1 : 0, 0);
  const data = Buffer.concat([discriminator, argsData]);

  return new TransactionInstruction({
    keys: [
      { pubkey: accounts.payer, isSigner: true, isWritable: true },
      { pubkey: accounts.ghostOrderPda, isSigner: false, isWritable: true },
      { pubkey: accounts.driftStatePda, isSigner: false, isWritable: false },
      { pubkey: accounts.driftUserPda, isSigner: false, isWritable: true },
      { pubkey: accounts.driftUserStatsPda, isSigner: false, isWritable: true },
      { pubkey: accounts.driftAuthority, isSigner: false, isWritable: false },
      { pubkey: accounts.perpMarketPda, isSigner: false, isWritable: true },
      { pubkey: accounts.oraclePda, isSigner: false, isWritable: false },
      { pubkey: MAGIC_CONTEXT_ID, isSigner: false, isWritable: false },
      { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: GHOST_CRANK_PROGRAM_ID,
    data,
  });
}

export function buildDelegateInstruction(
  payer: PublicKey,
  delegatedAccount: PublicKey,
  ownerProgram: PublicKey,
  commitFrequencyMs = COMMIT_FREQUENCY_MS
): TransactionInstruction {
  return createDelegateInstruction(
    {
      payer,
      delegatedAccount,
      ownerProgram,
    },
    {
      commitFrequencyMs,
    }
  );
}

export function buildCommitAndUndelegateInstruction(
  payer: PublicKey,
  accounts: PublicKey[]
): TransactionInstruction {
  return createCommitAndUndelegateInstruction(payer, accounts);
}

export function buildTopUpEscrowInstruction(
  escrowPda: PublicKey,
  escrowAuthority: PublicKey,
  payer: PublicKey,
  amountLamports: number
): TransactionInstruction {
  return createTopUpEscrowInstruction(
    escrowPda,
    escrowAuthority,
    payer,
    amountLamports
  );
}

export async function getWalletBalance(
  connection: Connection,
  publicKey: PublicKey
): Promise<number> {
  return connection.getBalance(publicKey);
}

export async function requestAirdrop(
  connection: Connection,
  publicKey: PublicKey,
  lamports: number
): Promise<string> {
  const signature = await connection.requestAirdrop(publicKey, lamports);
  await connection.confirmTransaction(signature, "confirmed");
  return signature;
}

export function deriveDriftStatePDA(): PublicKey {
  const [statePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("drift_state")],
    DRIFT_PROGRAM_ID
  );
  return statePda;
}

export function deriveDriftUserPDA(authority: PublicKey, subAccountNumber = 0): PublicKey {
  const subAccountBuffer = Buffer.alloc(2);
  subAccountBuffer.writeUInt16LE(subAccountNumber);

  const [userPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user"), authority.toBuffer(), subAccountBuffer],
    DRIFT_PROGRAM_ID
  );
  return userPda;
}

export function deriveDriftUserStatsPDA(authority: PublicKey): PublicKey {
  const [userStatsPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_stats"), authority.toBuffer()],
    DRIFT_PROGRAM_ID
  );
  return userStatsPda;
}

export function derivePerpMarketPDA(marketIndex: number): PublicKey {
  const marketIndexBuffer = Buffer.alloc(2);
  marketIndexBuffer.writeUInt16LE(marketIndex);

  const [perpMarketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("perp_market"), marketIndexBuffer],
    DRIFT_PROGRAM_ID
  );
  return perpMarketPda;
}

export const SOL_PERP_MARKET_INDEX = 0;
export const BASE_PRECISION = new BN(1_000_000_000);
export const PRICE_PRECISION = new BN(1_000_000);

export const SOL_PERP_ORACLE = new PublicKey(
  "H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG"
);

export interface DriftAccountPDAs {
  statePda: PublicKey;
  userPda: PublicKey;
  userStatsPda: PublicKey;
  perpMarketPda: PublicKey;
  oraclePda: PublicKey;
}

export function getDriftAccountPDAs(
  authority: PublicKey,
  marketIndex: number
): DriftAccountPDAs {
  return {
    statePda: deriveDriftStatePDA(),
    userPda: deriveDriftUserPDA(authority),
    userStatsPda: deriveDriftUserStatsPDA(authority),
    perpMarketPda: derivePerpMarketPDA(marketIndex),
    oraclePda: SOL_PERP_ORACLE,
  };
}

export function generateDefaultFeedId(): number[] {
  return Array(32).fill(0);
}

export function buildGhostCrankDelegateOrderInstruction(
  owner: PublicKey,
  ghostOrderPda: PublicKey
): TransactionInstruction {
  const { SystemProgram } = require("@solana/web3.js");

  const discriminator = Buffer.from([143, 114, 202, 66, 87, 29, 38, 130]);

  const delegationPdas = deriveDelegationPDAs(ghostOrderPda, GHOST_CRANK_PROGRAM_ID);

  return new TransactionInstruction({
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: ghostOrderPda, isSigner: false, isWritable: false },
      { pubkey: delegationPdas.delegationBuffer, isSigner: false, isWritable: true },
      { pubkey: delegationPdas.delegationRecord, isSigner: false, isWritable: true },
      { pubkey: delegationPdas.delegationMetadata, isSigner: false, isWritable: true },
      { pubkey: ghostOrderPda, isSigner: false, isWritable: true },
      { pubkey: GHOST_CRANK_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: GHOST_CRANK_PROGRAM_ID,
    data: discriminator,
  });
}

import {
  PrivacyAssessment,
  FieldExposure,
  SENSITIVE_GHOST_ORDER_FIELDS,
  calculatePrivacyAssessment,
  getAttackVectorsMitigated,
  getAttackVectorsRemaining,
  generatePrivacyRecommendations,
} from "./privacy-model";

export interface ComprehensivePrivacyResult {
  delegationVerified: boolean;
  baseAccountOwner: string | null;
  erAccountOwner: string | null;

  mempoolPrivacyAssumed: boolean;
  statusDiffersBetweenLayers: boolean;

  accountDataExposure: FieldExposure[];

  stateConsistency: {
    erStatus: number | null;
    baseStatus: number | null;
    erExists: boolean;
    baseExists: boolean;
  };

  metrics: {
    readableFieldCount: number;
    totalSensitiveFields: number;
    percentFieldsProtected: number;
    attackVectorsMitigated: string[];
    attackVectorsRemaining: string[];
  };

  privacyAssessment: PrivacyAssessment;
  recommendations: string[];
}

function getFieldValue(
  state: GhostOrderState,
  field: string
): string | number | boolean | null {
  switch (field) {
    case "trigger_price":
      return state.triggerPrice.toString();
    case "order_side":
      return state.orderSide;
    case "base_asset_amount":
      return state.baseAssetAmount.toString();
    case "market_index":
      return state.marketIndex;
    case "trigger_condition":
      return state.triggerCondition;
    case "reduce_only":
      return state.reduceOnly;
    case "expiry":
      return state.expiry.toString();
    case "feed_id":
      return state.feedId.join(",");
    default:
      return null;
  }
}

export async function verifyPrivacyComprehensive(
  connections: DualConnections,
  pda: PublicKey,
  expectedERStatus?: number
): Promise<ComprehensivePrivacyResult> {
  const [erAccountInfo, baseAccountInfo] = await Promise.all([
    connections.er.getAccountInfo(pda),
    connections.base.getAccountInfo(pda),
  ]);

  const erState = await fetchGhostOrderState(connections.er, pda);
  const baseState = await fetchGhostOrderState(connections.base, pda);

  const baseAccountOwner = baseAccountInfo?.owner.toBase58() ?? null;
  const erAccountOwner = erAccountInfo?.owner.toBase58() ?? null;
  const delegationVerified = baseAccountOwner === DELEGATION_PROGRAM_ID.toBase58();

  const accountDataExposure: FieldExposure[] = SENSITIVE_GHOST_ORDER_FIELDS.map(
    (field) => ({
      field,
      baseLayerValue: baseState ? getFieldValue(baseState, field) : null,
      isReadable: baseState !== null && getFieldValue(baseState, field) !== null,
    })
  );

  const readableFieldCount = accountDataExposure.filter((f) => f.isReadable).length;
  const totalSensitiveFields = SENSITIVE_GHOST_ORDER_FIELDS.length;
  const percentFieldsProtected =
    ((totalSensitiveFields - readableFieldCount) / totalSensitiveFields) * 100;

  const statusDiffersBetweenLayers =
    erState !== null &&
    baseState !== null &&
    erState.status !== baseState.status;

  const stateConsistency = {
    erStatus: erState?.status ?? null,
    baseStatus: baseState?.status ?? null,
    erExists: erState !== null,
    baseExists: baseState !== null,
  };

  const attackVectorsMitigated = getAttackVectorsMitigated(delegationVerified);
  const attackVectorsRemaining = getAttackVectorsRemaining(accountDataExposure);

  const privacyAssessment = calculatePrivacyAssessment(
    delegationVerified,
    statusDiffersBetweenLayers,
    readableFieldCount,
    totalSensitiveFields
  );

  const recommendations = generatePrivacyRecommendations(
    privacyAssessment,
    readableFieldCount
  );

  return {
    delegationVerified,
    baseAccountOwner,
    erAccountOwner,
    mempoolPrivacyAssumed: delegationVerified,
    statusDiffersBetweenLayers,
    accountDataExposure,
    stateConsistency,
    metrics: {
      readableFieldCount,
      totalSensitiveFields,
      percentFieldsProtected,
      attackVectorsMitigated,
      attackVectorsRemaining,
    },
    privacyAssessment,
    recommendations,
  };
}

export function printPrivacyReport(result: ComprehensivePrivacyResult): void {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║           MAGICBLOCK PRIVACY VERIFICATION REPORT             ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  console.log("\n┌─ Delegation Status ─────────────────────────────────────────┐");
  console.log(`│ Delegated: ${result.delegationVerified ? "✓ YES" : "✗ NO"}`);
  console.log(`│ Base Layer Owner: ${result.baseAccountOwner?.slice(0, 20) ?? "N/A"}...`);
  console.log("└──────────────────────────────────────────────────────────────┘");

  console.log("\n┌─ Privacy Assessment ────────────────────────────────────────┐");
  console.log(`│ Overall: ${result.privacyAssessment.toUpperCase()}`);
  console.log(`│ Mempool Privacy: ${result.mempoolPrivacyAssumed ? "✓ Assumed" : "✗ Not active"}`);
  console.log(`│ Status Differs (intent hidden): ${result.statusDiffersBetweenLayers ? "✓ YES" : "─ NO"}`);
  console.log("└──────────────────────────────────────────────────────────────┘");

  console.log("\n┌─ Account Data Exposure (Limitation) ───────────────────────┐");
  console.log(`│ Readable fields: ${result.metrics.readableFieldCount}/${result.metrics.totalSensitiveFields}`);
  console.log(`│ Fields protected: ${result.metrics.percentFieldsProtected.toFixed(0)}%`);
  result.accountDataExposure.forEach((f) => {
    const status = f.isReadable ? "⚠ READABLE" : "✓ Hidden";
    const value = f.isReadable ? ` = ${String(f.baseLayerValue).slice(0, 15)}` : "";
    console.log(`│   ${f.field}: ${status}${value}`);
  });
  console.log("└──────────────────────────────────────────────────────────────┘");

  console.log("\n┌─ Attack Vectors ────────────────────────────────────────────┐");
  console.log("│ MITIGATED:");
  result.metrics.attackVectorsMitigated.forEach((v) => console.log(`│   ✓ ${v}`));
  console.log("│ REMAINING:");
  result.metrics.attackVectorsRemaining.forEach((v) => console.log(`│   ⚠ ${v}`));
  console.log("└──────────────────────────────────────────────────────────────┘");

  if (result.recommendations.length > 0) {
    console.log("\n┌─ Recommendations ──────────────────────────────────────────┐");
    result.recommendations.forEach((r) => console.log(`│ → ${r}`));
    console.log("└──────────────────────────────────────────────────────────────┘");
  }

  console.log("");
}
