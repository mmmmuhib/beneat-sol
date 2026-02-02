import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { submitJitoBundle } from "./jito-bundles";
import {
  OrderParams,
  verifyCommitment,
} from "./ghost-order-commitment";
import {
  deriveUserPDA,
  deriveUserStatsPDA,
  derivePerpMarketPDA,
  deriveStatePDA,
  DRIFT_PROGRAM_ID,
  PERP_MARKET_ORACLE_ADDRESSES,
} from "./drift-instructions";
import { createHash } from "crypto";

const GHOST_CRANK_PROGRAM_ID = new PublicKey(
  "7VvD7j99AE7q9PC9atpJeMEUeEzZ5ZYH7WqSzGdmvsqv"
);

const GHOST_ORDER_SEED = Buffer.from("ghost_order");
const DELEGATE_SEED = Buffer.from("ghost_delegate");

export interface ReadyGhostOrder {
  pubkey: PublicKey;
  owner: PublicKey;
  orderId: bigint;
  marketIndex: number;
  paramsCommitment: Uint8Array;
  nonce: bigint;
  readyExpiresAt: bigint;
  delegatePda: PublicKey;
  delegateBump: number;
  driftUser: PublicKey;
  bump: number;
}

export interface GhostKeeperConfig {
  connection: Connection;
  keeperKeypair: Keypair;
  network: "mainnet" | "devnet";
  pollIntervalMs?: number;
  tipLamports?: number;
  onOrderExecuted?: (order: ReadyGhostOrder, bundleId: string) => void;
  onOrderFailed?: (order: ReadyGhostOrder, error: Error) => void;
  onLog?: (message: string) => void;
}

function getExecuteWithCommitmentDiscriminator(): Buffer {
  const hash = createHash("sha256")
    .update("global:execute_with_commitment")
    .digest();
  return Buffer.from(hash.subarray(0, 8));
}

export class GhostKeeperService {
  private connection: Connection;
  private keeperKeypair: Keypair;
  private network: "mainnet" | "devnet";
  private pollIntervalMs: number;
  private tipLamports: number;
  private isRunning = false;
  private pollTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private onOrderExecuted?: (order: ReadyGhostOrder, bundleId: string) => void;
  private onOrderFailed?: (order: ReadyGhostOrder, error: Error) => void;
  private log: (message: string) => void;

  private orderParamsCache: Map<
    string,
    { params: OrderParams; nonce: bigint }
  > = new Map();

  constructor(config: GhostKeeperConfig) {
    this.connection = config.connection;
    this.keeperKeypair = config.keeperKeypair;
    this.network = config.network;
    this.pollIntervalMs = config.pollIntervalMs ?? 2000;
    this.tipLamports = config.tipLamports ?? 10_000;
    this.onOrderExecuted = config.onOrderExecuted;
    this.onOrderFailed = config.onOrderFailed;
    this.log = config.onLog ?? console.log;
  }

  registerOrderParams(
    orderPubkey: PublicKey,
    params: OrderParams,
    nonce: bigint
  ): void {
    this.orderParamsCache.set(orderPubkey.toBase58(), { params, nonce });
    this.log(`[Keeper] Registered params for order ${orderPubkey.toBase58()}`);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.log("[Keeper] Already running");
      return;
    }

    this.isRunning = true;
    this.log("[Keeper] Starting ghost order keeper service");
    this.schedulePoll();
  }

  stop(): void {
    this.isRunning = false;
    if (this.pollTimeoutId) {
      clearTimeout(this.pollTimeoutId);
      this.pollTimeoutId = null;
    }
    this.log("[Keeper] Stopped");
  }

  private schedulePoll(): void {
    if (!this.isRunning) return;

    this.pollTimeoutId = setTimeout(async () => {
      await this.pollCycle();
      this.schedulePoll();
    }, this.pollIntervalMs);
  }

  private async pollCycle(): Promise<void> {
    try {
      const readyOrders = await this.fetchReadyOrders();

      for (const order of readyOrders) {
        const cached = this.orderParamsCache.get(order.pubkey.toBase58());
        if (!cached) {
          this.log(
            `[Keeper] No cached params for order ${order.pubkey.toBase58()}, skipping`
          );
          continue;
        }

        if (
          !verifyCommitment(cached.params, cached.nonce, order.paramsCommitment)
        ) {
          this.log(
            `[Keeper] Commitment mismatch for order ${order.pubkey.toBase58()}, skipping`
          );
          continue;
        }

        await this.executeOrder(order, cached.params, cached.nonce);
      }
    } catch (error) {
      this.log(
        `[Keeper] Poll error: ${error instanceof Error ? error.message : "Unknown"}`
      );
    }
  }

  private async fetchReadyOrders(): Promise<ReadyGhostOrder[]> {
    const accounts = await this.connection.getProgramAccounts(
      GHOST_CRANK_PROGRAM_ID,
      {
        filters: [
          { dataSize: 330 },
          {
            memcmp: {
              offset: 8 + 32 + 8 + 2 + 8 + 1 + 1 + 8 + 1,
              bytes: "4",
            },
          },
        ],
      }
    );

    const readyOrders: ReadyGhostOrder[] = [];

    for (const { pubkey, account } of accounts) {
      try {
        const order = this.parseGhostOrder(pubkey, account.data as Buffer);
        if (order) {
          readyOrders.push(order);
        }
      } catch {
        // Skip unparseable accounts
      }
    }

    return readyOrders;
  }

  private parseGhostOrder(
    pubkey: PublicKey,
    data: Buffer
  ): ReadyGhostOrder | null {
    if (data.length < 330) return null;

    let offset = 8;

    const owner = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    const orderId = data.readBigUInt64LE(offset);
    offset += 8;

    const marketIndex = data.readUInt16LE(offset);
    offset += 2;

    offset += 8;
    offset += 1;
    offset += 1;
    offset += 8;
    offset += 1;
    offset += 1;
    offset += 8;
    offset += 8;
    offset += 8;
    offset += 8;
    offset += 32;
    offset += 8;
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
      paramsCommitment,
      nonce,
      readyExpiresAt,
      delegatePda,
      delegateBump,
      driftUser,
      bump,
    };
  }

  private async executeOrder(
    order: ReadyGhostOrder,
    params: OrderParams,
    nonce: bigint
  ): Promise<void> {
    this.log(`[Keeper] Executing order ${order.pubkey.toBase58()}`);

    try {
      const executeIx = this.buildExecuteInstruction(order, params, nonce);

      const bundleId = await submitJitoBundle(
        this.connection,
        [executeIx],
        [this.keeperKeypair],
        {
          network: this.network,
          tipLamports: this.tipLamports,
        }
      );

      this.log(
        `[Keeper] Bundle submitted for order ${order.pubkey.toBase58()}: ${bundleId}`
      );

      this.orderParamsCache.delete(order.pubkey.toBase58());

      if (this.onOrderExecuted) {
        this.onOrderExecuted(order, bundleId);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      this.log(
        `[Keeper] Failed to execute order ${order.pubkey.toBase58()}: ${err.message}`
      );

      if (this.onOrderFailed) {
        this.onOrderFailed(order, err);
      }
    }
  }

  private buildExecuteInstruction(
    order: ReadyGhostOrder,
    params: OrderParams,
    nonce: bigint
  ): TransactionInstruction {
    const discriminator = getExecuteWithCommitmentDiscriminator();

    const argsBuffer = Buffer.alloc(2 + 1 + 8 + 1 + 8);
    let offset = 0;

    argsBuffer.writeUInt16LE(params.marketIndex, offset);
    offset += 2;
    argsBuffer.writeUInt8(params.orderSide === "long" ? 0 : 1, offset);
    offset += 1;
    params.baseAssetAmount.toArrayLike(Buffer, "le", 8).copy(argsBuffer, offset);
    offset += 8;
    argsBuffer.writeUInt8(params.reduceOnly ? 1 : 0, offset);
    offset += 1;

    const nonceBuf = Buffer.alloc(8);
    nonceBuf.writeBigUInt64LE(nonce);
    nonceBuf.copy(argsBuffer, offset);

    const data = Buffer.concat([discriminator, argsBuffer]);

    const driftState = deriveStatePDA();
    const driftUserStats = deriveUserStatsPDA(order.owner);
    const perpMarket = derivePerpMarketPDA(params.marketIndex);
    const oracle =
      PERP_MARKET_ORACLE_ADDRESSES[params.marketIndex] ?? PublicKey.default;

    return new TransactionInstruction({
      programId: GHOST_CRANK_PROGRAM_ID,
      keys: [
        { pubkey: this.keeperKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: order.pubkey, isSigner: false, isWritable: true },
        { pubkey: order.delegatePda, isSigner: false, isWritable: false },
        { pubkey: driftState, isSigner: false, isWritable: false },
        { pubkey: order.driftUser, isSigner: false, isWritable: true },
        { pubkey: driftUserStats, isSigner: false, isWritable: true },
        { pubkey: perpMarket, isSigner: false, isWritable: true },
        { pubkey: oracle, isSigner: false, isWritable: false },
        { pubkey: DRIFT_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data,
    });
  }
}

export function createGhostKeeperService(
  config: GhostKeeperConfig
): GhostKeeperService {
  return new GhostKeeperService(config);
}
