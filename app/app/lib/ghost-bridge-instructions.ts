import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import BN from "bn.js";
import {
  GHOST_BRIDGE_PROGRAM_ID,
  DRIFT_PROGRAM_ID,
  MAGIC_CONTEXT_ID,
  MAGIC_PROGRAM_ID,
} from "./magicblock-constants";

export { GHOST_BRIDGE_PROGRAM_ID, DRIFT_PROGRAM_ID };
export const MAGIC_CONTEXT = MAGIC_CONTEXT_ID;
export const MAGIC_PROGRAM = MAGIC_PROGRAM_ID;

const EXECUTOR_SEED = Buffer.from("executor");
const ENCRYPTED_ORDER_SEED = Buffer.from("encrypted_order");

async function getDiscriminator(instructionName: string): Promise<Buffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`global:${instructionName}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(new Uint8Array(hashBuffer).slice(0, 8));
}

export function deriveExecutorAuthorityPda(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [EXECUTOR_SEED, owner.toBuffer()],
    GHOST_BRIDGE_PROGRAM_ID
  );
}

export function deriveEncryptedOrderPda(
  owner: PublicKey,
  orderHash: Uint8Array
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ENCRYPTED_ORDER_SEED, owner.toBuffer(), Buffer.from(orderHash)],
    GHOST_BRIDGE_PROGRAM_ID
  );
}

export async function buildInitExecutorInstruction(
  owner: PublicKey
): Promise<TransactionInstruction> {
  const [executorAuthority] = deriveExecutorAuthorityPda(owner);
  const discriminator = await getDiscriminator("init_executor");

  return new TransactionInstruction({
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: executorAuthority, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: GHOST_BRIDGE_PROGRAM_ID,
    data: discriminator,
  });
}

export interface DelegateExecutorAccounts {
  delegationBuffer: PublicKey;
  delegationRecord: PublicKey;
  delegationMetadata: PublicKey;
}

export async function buildDelegateExecutorInstruction(
  owner: PublicKey,
  delegationAccounts: DelegateExecutorAccounts
): Promise<TransactionInstruction> {
  const [executorAuthority] = deriveExecutorAuthorityPda(owner);
  const discriminator = await getDiscriminator("delegate_executor");

  return new TransactionInstruction({
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: executorAuthority, isSigner: false, isWritable: false },
      { pubkey: executorAuthority, isSigner: false, isWritable: true },
      { pubkey: delegationAccounts.delegationBuffer, isSigner: false, isWritable: true },
      { pubkey: delegationAccounts.delegationRecord, isSigner: false, isWritable: true },
      { pubkey: delegationAccounts.delegationMetadata, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: GHOST_BRIDGE_PROGRAM_ID,
    data: discriminator,
  });
}

export async function buildUndelegateExecutorInstruction(
  payer: PublicKey,
  executorOwner: PublicKey,
  magicContext: PublicKey = MAGIC_CONTEXT,
  magicProgram: PublicKey = MAGIC_PROGRAM
): Promise<TransactionInstruction> {
  const [executorAuthority] = deriveExecutorAuthorityPda(executorOwner);
  const discriminator = await getDiscriminator("undelegate_executor");

  return new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: executorAuthority, isSigner: false, isWritable: true },
      { pubkey: magicContext, isSigner: false, isWritable: false },
      { pubkey: magicProgram, isSigner: false, isWritable: false },
    ],
    programId: GHOST_BRIDGE_PROGRAM_ID,
    data: discriminator,
  });
}

export interface CreateCompressedOrderArgs {
  orderId: BN;
  marketIndex: number;
  triggerPrice: BN;
  triggerCondition: "above" | "below";
  orderSide: "long" | "short";
  baseAssetAmount: BN;
  reduceOnly: boolean;
  expirySeconds: BN;
  feedId: Uint8Array;
}

function encodeCreateCompressedOrderArgs(args: CreateCompressedOrderArgs): Buffer {
  const buf = Buffer.alloc(8 + 2 + 8 + 1 + 1 + 8 + 1 + 8 + 32);
  let offset = 0;

  args.orderId.toArrayLike(Buffer, "le", 8).copy(buf, offset);
  offset += 8;

  buf.writeUInt16LE(args.marketIndex, offset);
  offset += 2;

  args.triggerPrice.toArrayLike(Buffer, "le", 8).copy(buf, offset);
  offset += 8;

  buf.writeUInt8(args.triggerCondition === "above" ? 0 : 1, offset);
  offset += 1;

  buf.writeUInt8(args.orderSide === "long" ? 0 : 1, offset);
  offset += 1;

  args.baseAssetAmount.toArrayLike(Buffer, "le", 8).copy(buf, offset);
  offset += 8;

  buf.writeUInt8(args.reduceOnly ? 1 : 0, offset);
  offset += 1;

  args.expirySeconds.toArrayLike(Buffer, "le", 8).copy(buf, offset);
  offset += 8;

  Buffer.from(args.feedId).copy(buf, offset, 0, 32);

  return buf;
}

export async function buildCreateCompressedOrderInstruction(
  owner: PublicKey,
  args: CreateCompressedOrderArgs
): Promise<TransactionInstruction> {
  const [executorAuthority] = deriveExecutorAuthorityPda(owner);
  const discriminator = await getDiscriminator("create_compressed_order");
  const argsData = encodeCreateCompressedOrderArgs(args);

  return new TransactionInstruction({
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: executorAuthority, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: GHOST_BRIDGE_PROGRAM_ID,
    data: Buffer.concat([discriminator, argsData]),
  });
}

export interface ConsumeAndExecuteArgs {
  orderId: BN;
  marketIndex: number;
  triggerPrice: BN;
  triggerCondition: "above" | "below";
  orderSide: "long" | "short";
  baseAssetAmount: BN;
  reduceOnly: boolean;
  expiry: BN;
  feedId: Uint8Array;
  salt: Uint8Array;
  currentPrice: BN;
  keepDelegated: boolean;
}

export interface ConsumeAndExecuteAccounts {
  driftState: PublicKey;
  driftUser: PublicKey;
  driftUserStats: PublicKey;
  driftAuthority: PublicKey;
  perpMarket: PublicKey;
  oracle: PublicKey;
  magicContext: PublicKey;
  magicProgram: PublicKey;
}

function encodeConsumeAndExecuteArgs(args: ConsumeAndExecuteArgs): Buffer {
  const buf = Buffer.alloc(8 + 2 + 8 + 1 + 1 + 8 + 1 + 8 + 32 + 16 + 8 + 1);
  let offset = 0;

  args.orderId.toArrayLike(Buffer, "le", 8).copy(buf, offset);
  offset += 8;

  buf.writeUInt16LE(args.marketIndex, offset);
  offset += 2;

  args.triggerPrice.toArrayLike(Buffer, "le", 8).copy(buf, offset);
  offset += 8;

  buf.writeUInt8(args.triggerCondition === "above" ? 0 : 1, offset);
  offset += 1;

  buf.writeUInt8(args.orderSide === "long" ? 0 : 1, offset);
  offset += 1;

  args.baseAssetAmount.toArrayLike(Buffer, "le", 8).copy(buf, offset);
  offset += 8;

  buf.writeUInt8(args.reduceOnly ? 1 : 0, offset);
  offset += 1;

  args.expiry.toArrayLike(Buffer, "le", 8).copy(buf, offset);
  offset += 8;

  Buffer.from(args.feedId).copy(buf, offset, 0, 32);
  offset += 32;

  Buffer.from(args.salt).copy(buf, offset, 0, 16);
  offset += 16;

  args.currentPrice.toArrayLike(Buffer, "le", 8).copy(buf, offset);
  offset += 8;

  buf.writeUInt8(args.keepDelegated ? 1 : 0, offset);

  return buf;
}

export async function buildConsumeAndExecuteInstruction(
  payer: PublicKey,
  executorOwner: PublicKey,
  args: ConsumeAndExecuteArgs,
  accounts: ConsumeAndExecuteAccounts
): Promise<TransactionInstruction> {
  const [executorAuthority] = deriveExecutorAuthorityPda(executorOwner);
  const discriminator = await getDiscriminator("consume_and_execute");
  const argsData = encodeConsumeAndExecuteArgs(args);

  return new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: executorAuthority, isSigner: false, isWritable: true },
      { pubkey: accounts.driftState, isSigner: false, isWritable: false },
      { pubkey: accounts.driftUser, isSigner: false, isWritable: true },
      { pubkey: accounts.driftUserStats, isSigner: false, isWritable: true },
      { pubkey: accounts.driftAuthority, isSigner: false, isWritable: false },
      { pubkey: accounts.perpMarket, isSigner: false, isWritable: true },
      { pubkey: accounts.oracle, isSigner: false, isWritable: false },
      { pubkey: accounts.magicContext, isSigner: false, isWritable: false },
      { pubkey: accounts.magicProgram, isSigner: false, isWritable: false },
    ],
    programId: GHOST_BRIDGE_PROGRAM_ID,
    data: Buffer.concat([discriminator, argsData]),
  });
}

export interface ExecutorAuthorityState {
  owner: PublicKey;
  orderCount: BN;
  isDelegated: boolean;
  bump: number;
  orderHashes: Uint8Array[];
  orderHashCount: number;
}

export function parseExecutorAuthorityAccount(data: Buffer): ExecutorAuthorityState {
  let offset = 8;

  const owner = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  const orderCount = new BN(data.slice(offset, offset + 8), "le");
  offset += 8;

  const isDelegated = data[offset] === 1;
  offset += 1;

  const bump = data[offset];
  offset += 1;

  const orderHashes: Uint8Array[] = [];
  for (let i = 0; i < 16; i++) {
    orderHashes.push(new Uint8Array(data.slice(offset, offset + 32)));
    offset += 32;
  }

  const orderHashCount = data[offset];

  return {
    owner,
    orderCount,
    isDelegated,
    bump,
    orderHashes: orderHashes.slice(0, orderHashCount),
    orderHashCount,
  };
}

export interface CreateEncryptedOrderArgs {
  orderHash: Uint8Array;
  encryptedData: Uint8Array;
  feedId: Uint8Array;
}

export async function buildCreateEncryptedOrderInstruction(
  owner: PublicKey,
  args: CreateEncryptedOrderArgs
): Promise<TransactionInstruction> {
  const [executorAuthority] = deriveExecutorAuthorityPda(owner);
  const [encryptedOrder] = deriveEncryptedOrderPda(owner, args.orderHash);
  const discriminator = await getDiscriminator("create_encrypted_order");

  const MAX_ENCRYPTED_DATA_LEN = 256;
  const encryptedDataPadded = new Uint8Array(MAX_ENCRYPTED_DATA_LEN);
  encryptedDataPadded.set(args.encryptedData.slice(0, MAX_ENCRYPTED_DATA_LEN));

  const buf = Buffer.alloc(32 + MAX_ENCRYPTED_DATA_LEN + 2 + 32);
  let offset = 0;

  Buffer.from(args.orderHash).copy(buf, offset);
  offset += 32;

  Buffer.from(encryptedDataPadded).copy(buf, offset);
  offset += MAX_ENCRYPTED_DATA_LEN;

  buf.writeUInt16LE(args.encryptedData.length, offset);
  offset += 2;

  Buffer.from(args.feedId).copy(buf, offset);

  return new TransactionInstruction({
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: executorAuthority, isSigner: false, isWritable: true },
      { pubkey: encryptedOrder, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: GHOST_BRIDGE_PROGRAM_ID,
    data: Buffer.concat([discriminator, buf]),
  });
}

export interface DelegateEncryptedOrderAccounts {
  delegationBuffer: PublicKey;
  delegationRecord: PublicKey;
  delegationMetadata: PublicKey;
}

export async function buildDelegateEncryptedOrderInstruction(
  owner: PublicKey,
  orderHash: Uint8Array,
  delegationAccounts: DelegateEncryptedOrderAccounts
): Promise<TransactionInstruction> {
  const [executorAuthority] = deriveExecutorAuthorityPda(owner);
  const [encryptedOrder] = deriveEncryptedOrderPda(owner, orderHash);
  const discriminator = await getDiscriminator("delegate_encrypted_order");

  const argsData = Buffer.alloc(32);
  Buffer.from(orderHash).copy(argsData);

  return new TransactionInstruction({
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: encryptedOrder, isSigner: false, isWritable: true },
      { pubkey: executorAuthority, isSigner: false, isWritable: true },
      { pubkey: delegationAccounts.delegationBuffer, isSigner: false, isWritable: true },
      { pubkey: delegationAccounts.delegationRecord, isSigner: false, isWritable: true },
      { pubkey: delegationAccounts.delegationMetadata, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: GHOST_BRIDGE_PROGRAM_ID,
    data: Buffer.concat([discriminator, argsData]),
  });
}

export async function buildCancelEncryptedOrderInstruction(
  owner: PublicKey,
  orderHash: Uint8Array
): Promise<TransactionInstruction> {
  const [executorAuthority] = deriveExecutorAuthorityPda(owner);
  const [encryptedOrder] = deriveEncryptedOrderPda(owner, orderHash);
  const discriminator = await getDiscriminator("cancel_encrypted_order");

  return new TransactionInstruction({
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: encryptedOrder, isSigner: false, isWritable: true },
      { pubkey: executorAuthority, isSigner: false, isWritable: true },
    ],
    programId: GHOST_BRIDGE_PROGRAM_ID,
    data: discriminator,
  });
}

export async function buildCloseEncryptedOrderInstruction(
  owner: PublicKey,
  orderHash: Uint8Array
): Promise<TransactionInstruction> {
  const [encryptedOrder] = deriveEncryptedOrderPda(owner, orderHash);
  const discriminator = await getDiscriminator("close_encrypted_order");

  return new TransactionInstruction({
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: encryptedOrder, isSigner: false, isWritable: true },
    ],
    programId: GHOST_BRIDGE_PROGRAM_ID,
    data: discriminator,
  });
}

export enum EncryptedOrderStatus {
  Active = 0,
  Triggered = 1,
  Executed = 2,
  Cancelled = 3,
}

export interface EncryptedOrderState {
  owner: PublicKey;
  orderHash: Uint8Array;
  executorAuthority: PublicKey;
  encryptedData: Uint8Array;
  dataLen: number;
  feedId: Uint8Array;
  createdAt: BN;
  triggeredAt: BN;
  executionPrice: BN;
  status: EncryptedOrderStatus;
  isDelegated: boolean;
  bump: number;
}

export interface AuthorizeExecutorArgs {
  executor: PublicKey;
  authorize: boolean;
}

export async function buildAuthorizeExecutorInstruction(
  owner: PublicKey,
  args: AuthorizeExecutorArgs
): Promise<TransactionInstruction> {
  const [executorAuthority] = deriveExecutorAuthorityPda(owner);
  const discriminator = await getDiscriminator("authorize_executor");

  const buf = Buffer.alloc(32 + 1);
  args.executor.toBuffer().copy(buf, 0);
  buf.writeUInt8(args.authorize ? 1 : 0, 32);

  return new TransactionInstruction({
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: executorAuthority, isSigner: false, isWritable: true },
    ],
    programId: GHOST_BRIDGE_PROGRAM_ID,
    data: Buffer.concat([discriminator, buf]),
  });
}

export function parseEncryptedOrderAccount(data: Buffer): EncryptedOrderState {
  const MAX_ENCRYPTED_DATA_LEN = 256;
  let offset = 8;

  const owner = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  const orderHash = new Uint8Array(data.slice(offset, offset + 32));
  offset += 32;

  const executorAuthority = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  const encryptedDataRaw = new Uint8Array(data.slice(offset, offset + MAX_ENCRYPTED_DATA_LEN));
  offset += MAX_ENCRYPTED_DATA_LEN;

  const dataLen = data.readUInt16LE(offset);
  offset += 2;

  const encryptedData = encryptedDataRaw.slice(0, dataLen);

  const feedId = new Uint8Array(data.slice(offset, offset + 32));
  offset += 32;

  const createdAt = new BN(data.slice(offset, offset + 8), "le");
  offset += 8;

  const triggeredAt = new BN(data.slice(offset, offset + 8), "le");
  offset += 8;

  const executionPrice = new BN(data.slice(offset, offset + 8), "le");
  offset += 8;

  const status = data[offset] as EncryptedOrderStatus;
  offset += 1;

  const isDelegated = data[offset] === 1;
  offset += 1;

  const bump = data[offset];

  return {
    owner,
    orderHash,
    executorAuthority,
    encryptedData,
    dataLen,
    feedId,
    createdAt,
    triggeredAt,
    executionPrice,
    status,
    isDelegated,
    bump,
  };
}
