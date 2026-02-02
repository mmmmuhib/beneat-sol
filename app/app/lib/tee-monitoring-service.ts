import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  Keypair,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import BN from "bn.js";
import {
  CompressedGhostOrderData,
  decryptOrderInBrowser,
} from "./tee-encryption";
import {
  GHOST_BRIDGE_PROGRAM_ID,
  DRIFT_PROGRAM_ID,
  MAGIC_CONTEXT_ID,
  MAGIC_PROGRAM_ID,
  MAGICBLOCK_DEVNET_RPC,
} from "./magicblock-constants";

const GHOST_CRANK_PROGRAM_ID = new PublicKey(
  "7VvD7j99AE7q9PC9atpJeMEUeEzZ5ZYH7WqSzGdmvsqv"
);

const MAGIC_CONTEXT = MAGIC_CONTEXT_ID;
const MAGIC_PROGRAM = MAGIC_PROGRAM_ID;
const PYTH_HERMES_URL = "https://hermes.pyth.network/v2/updates/price/latest";
const DEFAULT_POLL_INTERVAL_MS = 1000;
const MAX_ENCRYPTED_DATA_LEN = 256;

export interface MonitoredOrder {
  pubkey: PublicKey;
  owner: PublicKey;
  orderHash: Uint8Array;
  executorAuthority: PublicKey;
  encryptedData: Uint8Array;
  feedId: Uint8Array;
  createdAt: number;
  status: EncryptedOrderStatus;
  isDelegated: boolean;
  decryptedOrder?: CompressedGhostOrderData;
}

export enum EncryptedOrderStatus {
  Active = 0,
  Triggered = 1,
  Executed = 2,
  Cancelled = 3,
}

export interface TriggerAndExecuteArgs {
  salt: Uint8Array;
  orderId: BN;
  marketIndex: number;
  triggerPrice: BN;
  triggerCondition: number;
  orderSide: number;
  baseAssetAmount: BN;
  reduceOnly: boolean;
  expiry: BN;
  redelegateAfter: boolean;
}

export interface DriftAccounts {
  driftState: PublicKey;
  driftUser: PublicKey;
  driftUserStats: PublicKey;
  driftAuthority: PublicKey;
  perpMarket: PublicKey;
  oracle: PublicKey;
}

export interface TeeMonitoringConfig {
  pollIntervalMs?: number;
  teePrivateKey?: string;
  erRpcUrl?: string;
  useTwoPhaseExecution?: boolean;
  fetchGhostCrankOrders?: boolean;
  driftAccountsResolver?: (
    owner: PublicKey,
    marketIndex: number
  ) => Promise<DriftAccounts>;
  onOrderTriggered?: (order: MonitoredOrder, signature: string) => void;
  onOrderReadyForExecution?: (order: MonitoredOrder, decryptedOrder: CompressedGhostOrderData) => void;
  onOrderError?: (order: MonitoredOrder, error: Error) => void;
  onLog?: (message: string) => void;
}

export interface GhostCrankOrder {
  pubkey: PublicKey;
  owner: PublicKey;
  orderId: bigint;
  marketIndex: number;
  triggerPrice: bigint;
  triggerCondition: number;
  orderSide: number;
  baseAssetAmount: bigint;
  reduceOnly: boolean;
  status: number;
  createdAt: bigint;
  triggeredAt: bigint;
  executedAt: bigint;
  expiry: bigint;
  feedId: Uint8Array;
  crankTaskId: bigint;
  executionPrice: bigint;
  bump: number;
  paramsCommitment: Uint8Array;
  nonce: bigint;
  readyExpiresAt: bigint;
  delegatePda: PublicKey;
  delegateBump: number;
  driftUser: PublicKey;
}

export const GHOST_CRANK_ORDER_STATUS = {
  Pending: 0,
  Active: 1,
  Triggered: 2,
  Ready: 3,
  Executed: 4,
  Cancelled: 5,
  Expired: 6,
} as const;

interface PythPriceData {
  price: string;
  expo: number;
  conf: string;
  publish_time: number;
}

interface PythHermesResponse {
  parsed: Array<{
    id: string;
    price: PythPriceData;
  }>;
}

async function getDiscriminator(instructionName: string): Promise<Buffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`global:${instructionName}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(new Uint8Array(hashBuffer).slice(0, 8));
}

function parseEncryptedOrderAccount(
  pubkey: PublicKey,
  data: Buffer
): MonitoredOrder | null {
  if (data.length < 421) {
    return null;
  }

  let offset = 8;

  const owner = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  const orderHash = new Uint8Array(data.subarray(offset, offset + 32));
  offset += 32;

  const executorAuthority = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  const encryptedData = new Uint8Array(
    data.subarray(offset, offset + MAX_ENCRYPTED_DATA_LEN)
  );
  offset += MAX_ENCRYPTED_DATA_LEN;

  const dataLen = data.readUInt16LE(offset);
  offset += 2;

  const feedId = new Uint8Array(data.subarray(offset, offset + 32));
  offset += 32;

  const createdAt = new BN(data.subarray(offset, offset + 8), "le").toNumber();
  offset += 8;

  offset += 8;
  offset += 8;

  const statusByte = data.readUInt8(offset);
  const status = statusByte as EncryptedOrderStatus;
  offset += 1;

  const isDelegated = data.readUInt8(offset) === 1;

  return {
    pubkey,
    owner,
    orderHash,
    executorAuthority,
    encryptedData: encryptedData.slice(0, dataLen),
    feedId,
    createdAt,
    status,
    isDelegated,
  };
}

function parseGhostCrankOrder(
  pubkey: PublicKey,
  data: Buffer
): GhostCrankOrder | null {
  if (data.length < 330) return null;

  let offset = 8;

  const owner = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  const orderId = data.readBigUInt64LE(offset);
  offset += 8;

  const marketIndex = data.readUInt16LE(offset);
  offset += 2;

  const triggerPrice = data.readBigUInt64LE(offset);
  offset += 8;

  const triggerCondition = data.readUInt8(offset);
  offset += 1;

  const orderSide = data.readUInt8(offset);
  offset += 1;

  const baseAssetAmount = data.readBigUInt64LE(offset);
  offset += 8;

  const reduceOnly = data.readUInt8(offset) === 1;
  offset += 1;

  const status = data.readUInt8(offset);
  offset += 1;

  const createdAt = data.readBigInt64LE(offset);
  offset += 8;

  const triggeredAt = data.readBigInt64LE(offset);
  offset += 8;

  const executedAt = data.readBigInt64LE(offset);
  offset += 8;

  const expiry = data.readBigInt64LE(offset);
  offset += 8;

  const feedId = new Uint8Array(data.subarray(offset, offset + 32));
  offset += 32;

  const crankTaskId = data.readBigUInt64LE(offset);
  offset += 8;

  const executionPrice = data.readBigUInt64LE(offset);
  offset += 8;

  const bump = data.readUInt8(offset);
  offset += 1;

  const paramsCommitment = new Uint8Array(data.subarray(offset, offset + 32));
  offset += 32;

  const nonce = data.readBigUInt64LE(offset);
  offset += 8;

  const readyExpiresAt = data.readBigInt64LE(offset);
  offset += 8;

  const delegatePda = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  const delegateBump = data.readUInt8(offset);
  offset += 1;

  const driftUser = new PublicKey(data.subarray(offset, offset + 32));

  return {
    pubkey,
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
    paramsCommitment,
    nonce,
    readyExpiresAt,
    delegatePda,
    delegateBump,
    driftUser,
  };
}

function encodeTriggerAndExecuteArgs(args: TriggerAndExecuteArgs): Buffer {
  const buf = Buffer.alloc(16 + 8 + 2 + 8 + 1 + 1 + 8 + 1 + 8 + 1);
  let offset = 0;

  Buffer.from(args.salt).copy(buf, offset);
  offset += 16;

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

  args.expiry.toArrayLike(Buffer, "le", 8).copy(buf, offset);
  offset += 8;

  buf.writeUInt8(args.redelegateAfter ? 1 : 0, offset);

  return buf;
}

export class TeeMonitoringService {
  private connection: Connection;
  private teeKeypair: Keypair | null = null;
  private teeX25519PrivateKeyHex: string | null = null;
  private monitoredOrders: Map<string, MonitoredOrder> = new Map();
  private ghostCrankOrders: Map<string, GhostCrankOrder> = new Map();
  private pollIntervalMs: number;
  private isRunning: boolean = false;
  private pollTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private priceCache: Map<string, { price: number; timestamp: number }> =
    new Map();
  private driftAccountsResolver?: (
    owner: PublicKey,
    marketIndex: number
  ) => Promise<DriftAccounts>;
  private onOrderTriggered?: (order: MonitoredOrder, signature: string) => void;
  private onOrderReadyForExecution?: (order: MonitoredOrder, decryptedOrder: CompressedGhostOrderData) => void;
  private onOrderError?: (order: MonitoredOrder, error: Error) => void;
  private log: (message: string) => void;

  private pendingPrivateKey: string | null = null;
  private useTwoPhaseExecution: boolean = false;
  private fetchGhostCrankOrdersEnabled: boolean = false;

  constructor(config: TeeMonitoringConfig = {}) {
    this.connection = new Connection(config.erRpcUrl || MAGICBLOCK_DEVNET_RPC, {
      commitment: "confirmed",
      wsEndpoint: (config.erRpcUrl || MAGICBLOCK_DEVNET_RPC).replace(
        "https://",
        "wss://"
      ),
    });

    this.pollIntervalMs = config.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS;
    this.driftAccountsResolver = config.driftAccountsResolver;
    this.onOrderTriggered = config.onOrderTriggered;
    this.onOrderReadyForExecution = config.onOrderReadyForExecution;
    this.onOrderError = config.onOrderError;
    this.log = config.onLog || console.log;
    this.useTwoPhaseExecution = config.useTwoPhaseExecution ?? false;
    this.fetchGhostCrankOrdersEnabled = config.fetchGhostCrankOrders ?? false;

    this.pendingPrivateKey =
      config.teePrivateKey || process.env.TEE_PRIVATE_KEY || null;
  }

  private async initializeKeypairAsync(privateKeyHex: string): Promise<void> {
    try {
      const privateKeyBytes = Buffer.from(privateKeyHex, "hex");
      let ed25519Seed: Uint8Array;

      if (privateKeyBytes.length === 64) {
        this.teeKeypair = Keypair.fromSecretKey(privateKeyBytes);
        ed25519Seed = privateKeyBytes.slice(0, 32);
      } else if (privateKeyBytes.length === 32) {
        ed25519Seed = privateKeyBytes;
        const { secretKey } = Keypair.fromSeed(ed25519Seed);
        this.teeKeypair = Keypair.fromSecretKey(secretKey);
      } else {
        throw new Error(
          `Invalid private key length: ${privateKeyBytes.length}`
        );
      }

      const nobleEd25519 = await import("@noble/curves/ed25519.js");
      const x25519PrivateKey = nobleEd25519.ed25519.utils.toMontgomerySecret(ed25519Seed);
      this.teeX25519PrivateKeyHex = Buffer.from(x25519PrivateKey).toString(
        "hex"
      );

      const eciesModule = await import("eciesjs");
      const eciesPrivateKey = new eciesModule.PrivateKey(
        Buffer.from(ed25519Seed)
      );
      const x25519PublicKeyHex = eciesPrivateKey.publicKey.toHex();

      this.log(
        `[TEE] Initialized with Solana public key: ${this.teeKeypair.publicKey.toBase58()}`
      );
      this.log(
        `[TEE] x25519 public key for NEXT_PUBLIC_TEE_PUBLIC_KEY: ${x25519PublicKeyHex}`
      );
    } catch (error) {
      this.log(
        `[TEE] Failed to initialize keypair: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      this.teeKeypair = null;
      this.teeX25519PrivateKeyHex = null;
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.log("[TEE] Service is already running");
      return;
    }

    if (this.pendingPrivateKey && !this.teeKeypair) {
      await this.initializeKeypairAsync(this.pendingPrivateKey);
    }

    if (!this.teeKeypair || !this.teeX25519PrivateKeyHex) {
      throw new Error(
        "TEE private key not configured. Set TEE_PRIVATE_KEY environment variable or pass it in config."
      );
    }

    this.isRunning = true;
    this.log("[TEE] Monitoring service started");

    await this.fetchAllActiveOrders();

    this.schedulePoll();
  }

  stop(): void {
    this.isRunning = false;

    if (this.pollTimeoutId) {
      clearTimeout(this.pollTimeoutId);
      this.pollTimeoutId = null;
    }

    this.log("[TEE] Monitoring service stopped");
  }

  async addOrder(orderPubkey: PublicKey | string): Promise<boolean> {
    const pubkey =
      typeof orderPubkey === "string"
        ? new PublicKey(orderPubkey)
        : orderPubkey;
    const pubkeyStr = pubkey.toBase58();

    if (this.monitoredOrders.has(pubkeyStr)) {
      this.log(`[TEE] Order ${pubkeyStr} is already being monitored`);
      return true;
    }

    try {
      const accountInfo = await this.connection.getAccountInfo(pubkey);

      if (!accountInfo) {
        this.log(`[TEE] Order account ${pubkeyStr} not found`);
        return false;
      }

      const order = parseEncryptedOrderAccount(
        pubkey,
        accountInfo.data as Buffer
      );

      if (!order) {
        this.log(`[TEE] Failed to parse order account ${pubkeyStr}`);
        return false;
      }

      if (order.status !== EncryptedOrderStatus.Active) {
        this.log(
          `[TEE] Order ${pubkeyStr} is not active (status: ${order.status})`
        );
        return false;
      }

      await this.decryptOrder(order);

      this.monitoredOrders.set(pubkeyStr, order);
      this.log(`[TEE] Added order ${pubkeyStr} to monitoring`);

      return true;
    } catch (error) {
      this.log(
        `[TEE] Error adding order ${pubkeyStr}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      return false;
    }
  }

  removeOrder(orderPubkey: PublicKey | string): boolean {
    const pubkeyStr =
      typeof orderPubkey === "string" ? orderPubkey : orderPubkey.toBase58();

    const removed = this.monitoredOrders.delete(pubkeyStr);

    if (removed) {
      this.log(`[TEE] Removed order ${pubkeyStr} from monitoring`);
    }

    return removed;
  }

  getMonitoredOrders(): MonitoredOrder[] {
    return Array.from(this.monitoredOrders.values());
  }

  getGhostCrankOrders(): GhostCrankOrder[] {
    return Array.from(this.ghostCrankOrders.values());
  }

  private async fetchAllActiveOrders(): Promise<void> {
    this.log("[TEE] Fetching all active encrypted orders...");

    try {
      const accounts = await this.connection.getProgramAccounts(
        GHOST_BRIDGE_PROGRAM_ID,
        {
          filters: [{ dataSize: 420 }],
        }
      );

      let addedCount = 0;

      for (const { pubkey, account } of accounts) {
        const order = parseEncryptedOrderAccount(
          pubkey,
          account.data as Buffer
        );

        if (order && order.status === EncryptedOrderStatus.Active) {
          const pubkeyStr = pubkey.toBase58();

          if (!this.monitoredOrders.has(pubkeyStr)) {
            await this.decryptOrder(order);
            this.monitoredOrders.set(pubkeyStr, order);
            addedCount++;
          }
        }
      }

      this.log(
        `[TEE] Found ${addedCount} active orders (total: ${this.monitoredOrders.size})`
      );

      if (this.fetchGhostCrankOrdersEnabled) {
        await this.fetchGhostCrankOrders();
      }
    } catch (error) {
      this.log(
        `[TEE] Error fetching orders: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  private async fetchGhostCrankOrders(): Promise<void> {
    this.log("[TEE] Fetching Ghost Crank orders...");

    try {
      const accounts = await this.connection.getProgramAccounts(
        GHOST_CRANK_PROGRAM_ID,
        {
          filters: [{ dataSize: 330 }],
        }
      );

      let addedCount = 0;

      for (const { pubkey, account } of accounts) {
        const order = parseGhostCrankOrder(pubkey, account.data as Buffer);

        if (
          order &&
          (order.status === GHOST_CRANK_ORDER_STATUS.Active ||
            order.status === GHOST_CRANK_ORDER_STATUS.Triggered ||
            order.status === GHOST_CRANK_ORDER_STATUS.Ready)
        ) {
          const pubkeyStr = pubkey.toBase58();

          if (!this.ghostCrankOrders.has(pubkeyStr)) {
            this.ghostCrankOrders.set(pubkeyStr, order);
            addedCount++;
          }
        }
      }

      this.log(
        `[TEE] Found ${addedCount} Ghost Crank orders (total: ${this.ghostCrankOrders.size})`
      );
    } catch (error) {
      this.log(
        `[TEE] Error fetching Ghost Crank orders: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  private async decryptOrder(order: MonitoredOrder): Promise<void> {
    if (!this.teeKeypair || !this.teeX25519PrivateKeyHex) {
      throw new Error("TEE keypair not initialized");
    }

    try {
      const encryptedBase64 = Buffer.from(order.encryptedData).toString(
        "base64"
      );

      const decryptedOrder = await decryptOrderInBrowser(
        encryptedBase64,
        this.teeX25519PrivateKeyHex
      );

      order.decryptedOrder = decryptedOrder;

      this.log(
        `[TEE] Decrypted order: market=${decryptedOrder.marketIndex}, ` +
          `trigger=${decryptedOrder.triggerPrice}, ` +
          `condition=${decryptedOrder.triggerCondition}`
      );
    } catch (error) {
      this.log(
        `[TEE] Failed to decrypt order ${order.pubkey.toBase58()}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  private schedulePoll(): void {
    if (!this.isRunning) return;

    this.pollTimeoutId = setTimeout(async () => {
      await this.pollCycle();
      this.schedulePoll();
    }, this.pollIntervalMs);
  }

  private async pollCycle(): Promise<void> {
    if (this.monitoredOrders.size === 0) {
      return;
    }

    const feedIds = new Set<string>();

    for (const order of this.monitoredOrders.values()) {
      if (order.decryptedOrder) {
        feedIds.add(order.decryptedOrder.feedId);
      }
    }

    if (feedIds.size === 0) {
      return;
    }

    await this.fetchPrices(Array.from(feedIds));

    for (const order of this.monitoredOrders.values()) {
      if (!order.decryptedOrder) continue;

      const shouldTrigger = this.checkTriggerCondition(order);

      if (shouldTrigger) {
        await this.executeTrigger(order);
      }
    }
  }

  private async fetchPrices(feedIds: string[]): Promise<void> {
    try {
      const params = new URLSearchParams();
      feedIds.forEach((id) => params.append("ids[]", id));

      const response = await fetch(`${PYTH_HERMES_URL}?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: PythHermesResponse = await response.json();
      const now = Date.now();

      for (const priceData of data.parsed) {
        const price =
          Number(priceData.price.price) * Math.pow(10, priceData.price.expo);
        this.priceCache.set(priceData.id, { price, timestamp: now });
      }
    } catch (error) {
      this.log(
        `[TEE] Error fetching prices: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  private checkTriggerCondition(order: MonitoredOrder): boolean {
    if (!order.decryptedOrder) return false;

    const feedId = order.decryptedOrder.feedId;
    const cached = this.priceCache.get(feedId);

    if (!cached) {
      return false;
    }

    if (Date.now() - cached.timestamp > 60000) {
      return false;
    }

    const triggerPrice = Number(order.decryptedOrder.triggerPrice) / 1e6;
    const currentPrice = cached.price;
    const condition = order.decryptedOrder.triggerCondition;

    if (condition === "above") {
      return currentPrice >= triggerPrice;
    } else {
      return currentPrice <= triggerPrice;
    }
  }

  private async executeTrigger(order: MonitoredOrder): Promise<void> {
    if (!this.teeKeypair || !order.decryptedOrder) {
      return;
    }

    const pubkeyStr = order.pubkey.toBase58();

    this.log(`[TEE] Trigger condition met for order ${pubkeyStr}`);

    if (this.useTwoPhaseExecution) {
      await this.executeTwoPhase(order);
    } else {
      await this.executeDirectly(order);
    }
  }

  private async executeTwoPhase(order: MonitoredOrder): Promise<void> {
    if (!this.teeKeypair || !order.decryptedOrder) {
      return;
    }

    const pubkeyStr = order.pubkey.toBase58();
    const decrypted = order.decryptedOrder;

    try {
      const cached = this.priceCache.get(decrypted.feedId);
      const executionPrice = cached ? Math.floor(cached.price * 1e6) : 0;

      const markReadyIx = await this.buildMarkReadyInstruction(
        order.pubkey,
        executionPrice
      );

      const tx = new Transaction().add(markReadyIx);

      const { blockhash } = await this.connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = this.teeKeypair.publicKey;
      tx.sign(this.teeKeypair);

      const signature = await this.connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: true,
        preflightCommitment: "confirmed",
      });

      await this.connection.confirmTransaction(signature, "confirmed");

      this.log(
        `[TEE] Order ${pubkeyStr} marked ready for execution. Signature: ${signature}`
      );

      order.status = EncryptedOrderStatus.Triggered;

      if (this.onOrderTriggered) {
        this.onOrderTriggered(order, signature);
      }

      if (this.onOrderReadyForExecution) {
        this.onOrderReadyForExecution(order, decrypted);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      this.log(`[TEE] Failed to mark ready ${pubkeyStr}: ${err.message}`);

      if (this.onOrderError) {
        this.onOrderError(order, err);
      }
    }
  }

  private async buildMarkReadyInstruction(
    orderPubkey: PublicKey,
    executionPrice: number
  ): Promise<TransactionInstruction> {
    const discriminator = await getDiscriminator("mark_ready");

    const data = Buffer.alloc(8 + 8);
    discriminator.copy(data, 0);
    data.writeBigInt64LE(BigInt(executionPrice), 8);

    return new TransactionInstruction({
      programId: GHOST_CRANK_PROGRAM_ID,
      keys: [
        { pubkey: this.teeKeypair!.publicKey, isSigner: true, isWritable: true },
        { pubkey: orderPubkey, isSigner: false, isWritable: true },
      ],
      data,
    });
  }

  private async executeDirectly(order: MonitoredOrder): Promise<void> {
    if (!this.teeKeypair || !order.decryptedOrder) {
      return;
    }

    const pubkeyStr = order.pubkey.toBase58();

    try {
      const decrypted = order.decryptedOrder;

      const driftAccounts = await this.resolveDriftAccounts(
        order.owner,
        decrypted.marketIndex
      );

      const args: TriggerAndExecuteArgs = {
        salt: decrypted.salt
          ? Buffer.from(decrypted.salt, "hex")
          : new Uint8Array(16),
        orderId: new BN(decrypted.orderId),
        marketIndex: decrypted.marketIndex,
        triggerPrice: new BN(decrypted.triggerPrice),
        triggerCondition: decrypted.triggerCondition === "above" ? 0 : 1,
        orderSide: decrypted.orderSide === "long" ? 0 : 1,
        baseAssetAmount: new BN(decrypted.baseAssetAmount),
        reduceOnly: decrypted.reduceOnly,
        expiry: new BN(decrypted.expiry),
        redelegateAfter: false,
      };

      const priceFeed = this.derivePriceFeedPda(order.feedId);

      const instruction = await this.buildTriggerAndExecuteInstruction(
        order.pubkey,
        order.executorAuthority,
        priceFeed,
        driftAccounts,
        args
      );

      const tx = new Transaction().add(instruction);

      const { blockhash } = await this.connection.getLatestBlockhash(
        "confirmed"
      );
      tx.recentBlockhash = blockhash;
      tx.feePayer = this.teeKeypair.publicKey;
      tx.sign(this.teeKeypair);

      const signature = await this.connection.sendRawTransaction(
        tx.serialize(),
        {
          skipPreflight: true,
          preflightCommitment: "confirmed",
        }
      );

      await this.connection.confirmTransaction(signature, "confirmed");

      this.log(`[TEE] Order ${pubkeyStr} executed. Signature: ${signature}`);

      this.monitoredOrders.delete(pubkeyStr);

      if (this.onOrderTriggered) {
        this.onOrderTriggered(order, signature);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      this.log(
        `[TEE] Failed to execute trigger for ${pubkeyStr}: ${err.message}`
      );

      if (this.onOrderError) {
        this.onOrderError(order, err);
      }
    }
  }

  private async resolveDriftAccounts(
    owner: PublicKey,
    marketIndex: number
  ): Promise<DriftAccounts> {
    if (this.driftAccountsResolver) {
      return this.driftAccountsResolver(owner, marketIndex);
    }

    const driftState = PublicKey.findProgramAddressSync(
      [Buffer.from("drift_state")],
      DRIFT_PROGRAM_ID
    )[0];

    const driftUser = PublicKey.findProgramAddressSync(
      [Buffer.from("user"), owner.toBuffer()],
      DRIFT_PROGRAM_ID
    )[0];

    const driftUserStats = PublicKey.findProgramAddressSync(
      [Buffer.from("user_stats"), owner.toBuffer()],
      DRIFT_PROGRAM_ID
    )[0];

    const perpMarket = PublicKey.findProgramAddressSync(
      [
        Buffer.from("perp_market"),
        new BN(marketIndex).toArrayLike(Buffer, "le", 2),
      ],
      DRIFT_PROGRAM_ID
    )[0];

    let oracle = PublicKey.default;
    try {
      const perpMarketInfo = await this.connection.getAccountInfo(perpMarket);
      if (perpMarketInfo && perpMarketInfo.data.length >= 72) {
        const oracleOffset = 8 + 32;
        const oracleBytes = perpMarketInfo.data.slice(
          oracleOffset,
          oracleOffset + 32
        );
        oracle = new PublicKey(oracleBytes);
        this.log(`[TEE] Resolved oracle for market ${marketIndex}: ${oracle.toBase58()}`);
      } else {
        this.log(`[TEE] Warning: Could not fetch perp market ${marketIndex} to resolve oracle`);
      }
    } catch (error) {
      this.log(
        `[TEE] Warning: Failed to resolve oracle for market ${marketIndex}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    return {
      driftState,
      driftUser,
      driftUserStats,
      driftAuthority: owner,
      perpMarket,
      oracle,
    };
  }

  private derivePriceFeedPda(feedId: Uint8Array): PublicKey {
    const PYTH_RECEIVER_ID = new PublicKey(
      "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ"
    );
    const [priceFeedPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pyth_price"), feedId],
      PYTH_RECEIVER_ID
    );
    return priceFeedPda;
  }

  private async buildTriggerAndExecuteInstruction(
    encryptedOrder: PublicKey,
    executorAuthority: PublicKey,
    priceFeed: PublicKey,
    driftAccounts: DriftAccounts,
    args: TriggerAndExecuteArgs
  ): Promise<TransactionInstruction> {
    const discriminator = await getDiscriminator("trigger_and_execute");
    const argsData = encodeTriggerAndExecuteArgs(args);
    const data = Buffer.concat([discriminator, argsData]);

    return new TransactionInstruction({
      keys: [
        {
          pubkey: this.teeKeypair!.publicKey,
          isSigner: true,
          isWritable: true,
        },
        { pubkey: encryptedOrder, isSigner: false, isWritable: true },
        { pubkey: executorAuthority, isSigner: false, isWritable: true },
        { pubkey: priceFeed, isSigner: false, isWritable: false },
        {
          pubkey: driftAccounts.driftState,
          isSigner: false,
          isWritable: false,
        },
        { pubkey: driftAccounts.driftUser, isSigner: false, isWritable: true },
        {
          pubkey: driftAccounts.driftUserStats,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: driftAccounts.driftAuthority,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: driftAccounts.perpMarket,
          isSigner: false,
          isWritable: true,
        },
        { pubkey: driftAccounts.oracle, isSigner: false, isWritable: false },
        { pubkey: MAGIC_CONTEXT, isSigner: false, isWritable: false },
        { pubkey: MAGIC_PROGRAM, isSigner: false, isWritable: false },
      ],
      programId: GHOST_BRIDGE_PROGRAM_ID,
      data,
    });
  }
}

export function createTeeMonitoringService(
  config?: TeeMonitoringConfig
): TeeMonitoringService {
  return new TeeMonitoringService(config);
}
