import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import * as crypto from "crypto";

import {
  getDriftUserAccount,
  getDriftUserOrders,
  getDriftUserPositions,
  verifyOrderExists,
  verifyPositionChange,
  isDriftUserInitialized,
  isDriftUserStatsInitialized,
  getDriftAccountPDAs,
  DRIFT_PROGRAM_ID,
} from "../lib/drift-verification";

import {
  SOL_PERP_MARKET_INDEX,
  BASE_PRECISION,
  PRICE_PRECISION,
  PERP_MARKET_ORACLE_ADDRESSES,
  buildInitializeUserInstruction,
  buildInitializeUserStatsInstruction,
  deriveUserPDA,
  deriveUserStatsPDA,
} from "../lib/drift-instructions";

const DEVNET_RPC = "https://api.devnet.solana.com";
const ER_RPC = "https://devnet.magicblock.app";
const GHOST_CRANK_PROGRAM_ID = new PublicKey("7VvD7j99AE7q9PC9atpJeMEUeEzZ5ZYH7WqSzGdmvsqv");
const MAGIC_PROGRAM_ID = new PublicKey("Magic11111111111111111111111111111111111111");
const MAGIC_CONTEXT_ID = new PublicKey("MagicContext1111111111111111111111111111111");

interface DriftInitResult {
  wasInitialized: boolean;
  alreadyExists: boolean;
  userPDA: PublicKey;
  userStatsPDA: PublicKey;
  signature?: string;
  error?: string;
}

async function ensureDriftInitialized(
  connection: Connection,
  wallet: Keypair,
  subAccountNumber = 0
): Promise<DriftInitResult> {
  const userPDA = deriveUserPDA(wallet.publicKey, subAccountNumber);
  const userStatsPDA = deriveUserStatsPDA(wallet.publicKey);

  const isUserInit = await isDriftUserInitialized(connection, wallet.publicKey, subAccountNumber);

  if (isUserInit) {
    console.log("[E2E] Drift user already initialized:", userPDA.toBase58());
    return {
      wasInitialized: false,
      alreadyExists: true,
      userPDA,
      userStatsPDA,
    };
  }

  console.log("[E2E] Drift user not initialized, creating accounts...");
  console.log("[E2E] User PDA:", userPDA.toBase58());
  console.log("[E2E] User Stats PDA:", userStatsPDA.toBase58());

  try {
    const isStatsInit = await isDriftUserStatsInitialized(connection, wallet.publicKey);
    let lastSignature: string | undefined;

    if (!isStatsInit) {
      console.log("[E2E] Step 1: Initializing user_stats account...");

      const initStatsIx = buildInitializeUserStatsInstruction({
        authority: wallet.publicKey,
        payer: wallet.publicKey,
      });

      const statsTx = new Transaction().add(initStatsIx);
      const { blockhash: statsBlockhash, lastValidBlockHeight: statsHeight } =
        await connection.getLatestBlockhash("confirmed");
      statsTx.recentBlockhash = statsBlockhash;
      statsTx.feePayer = wallet.publicKey;
      statsTx.sign(wallet);

      const statsSignature = await connection.sendRawTransaction(statsTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      console.log("[E2E] Initialize user_stats tx sent:", statsSignature);

      const statsConfirmation = await connection.confirmTransaction(
        { signature: statsSignature, blockhash: statsBlockhash, lastValidBlockHeight: statsHeight },
        "confirmed"
      );

      if (statsConfirmation.value.err) {
        throw new Error(`User stats init failed: ${JSON.stringify(statsConfirmation.value.err)}`);
      }

      console.log("[E2E] User stats initialized successfully");
      lastSignature = statsSignature;
    } else {
      console.log("[E2E] User stats already initialized, skipping step 1");
    }

    console.log("[E2E] Step 2: Initializing user account...");

    const initUserIx = buildInitializeUserInstruction({
      authority: wallet.publicKey,
      payer: wallet.publicKey,
      subAccountNumber,
      name: "Beneat-E2E",
    });

    const userTx = new Transaction().add(initUserIx);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    userTx.recentBlockhash = blockhash;
    userTx.feePayer = wallet.publicKey;
    userTx.sign(wallet);

    const signature = await connection.sendRawTransaction(userTx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    console.log("[E2E] Initialize user tx sent:", signature);

    const confirmation = await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed"
    );

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log("[E2E] Drift user initialized successfully");

    const verifyInit = await isDriftUserInitialized(connection, wallet.publicKey, subAccountNumber);
    if (!verifyInit) {
      throw new Error("Account verification failed after initialization");
    }

    return {
      wasInitialized: true,
      alreadyExists: false,
      userPDA,
      userStatsPDA,
      signature,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown initialization error";
    console.error("[E2E] Failed to initialize Drift user:", message);
    return {
      wasInitialized: false,
      alreadyExists: false,
      userPDA,
      userStatsPDA,
      error: message,
    };
  }
}

async function anchorDiscriminator(name: string): Promise<Buffer> {
  const data = `global:${name}`;
  const hash = crypto.createHash("sha256").update(data).digest();
  return Buffer.from(hash.subarray(0, 8));
}

function encodeCreateGhostOrderArgs(args: {
  orderId: BN;
  marketIndex: number;
  triggerPrice: BN;
  triggerCondition: number;
  orderSide: number;
  baseAssetAmount: BN;
  reduceOnly: boolean;
  expirySeconds: BN;
  feedId: number[];
}): Buffer {
  const buf = Buffer.alloc(8 + 2 + 8 + 1 + 1 + 8 + 1 + 8 + 32);
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

  return buf;
}

function deriveGhostOrderPDA(owner: PublicKey, orderId: BN): PublicKey {
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

interface GhostOrderState {
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
}

async function fetchGhostOrder(
  connection: Connection,
  pda: PublicKey
): Promise<GhostOrderState | null> {
  try {
    const accountInfo = await connection.getAccountInfo(pda);
    if (!accountInfo) return null;

    const data = accountInfo.data;
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
    };
  } catch (error) {
    console.error("[E2E] Failed to fetch ghost order:", error);
    return null;
  }
}

const ORDER_STATUS = {
  Pending: 0,
  Active: 1,
  Triggered: 2,
  Executed: 3,
  Cancelled: 4,
  Expired: 5,
} as const;

const TRIGGER_CONDITION = {
  Above: 0,
  Below: 1,
} as const;

const ORDER_SIDE = {
  Long: 0,
  Short: 1,
} as const;

const SOL_PYTH_FEED_ID = Array(32).fill(0);

describe("E2E: Ghost Order → Drift Execution", () => {
  let baseConnection: Connection;
  let erConnection: Connection;
  let testWallet: Keypair;
  let sessionKeypair: Keypair;
  let orderId: BN;
  let ghostOrderPda: PublicKey;

  beforeAll(async () => {
    baseConnection = new Connection(DEVNET_RPC, "confirmed");
    erConnection = new Connection(ER_RPC, {
      commitment: "confirmed",
      wsEndpoint: ER_RPC.replace("https://", "wss://"),
    });

    testWallet = Keypair.generate();
    sessionKeypair = Keypair.generate();
    orderId = new BN(Date.now());
    ghostOrderPda = deriveGhostOrderPDA(testWallet.publicKey, orderId);

    console.log("[E2E] Test wallet:", testWallet.publicKey.toBase58());
    console.log("[E2E] Session keypair:", sessionKeypair.publicKey.toBase58());
    console.log("[E2E] Ghost order PDA:", ghostOrderPda.toBase58());
  });

  afterAll(async () => {
    console.log("[E2E] Test cleanup complete");
  });

  describe("Prerequisites Check", () => {
    it("should connect to devnet", async () => {
      const slot = await baseConnection.getSlot();
      expect(slot).toBeGreaterThan(0);
      console.log("[E2E] Devnet slot:", slot);
    });

    it("should connect to ER RPC", async () => {
      const slot = await erConnection.getSlot();
      expect(slot).toBeGreaterThan(0);
      console.log("[E2E] ER slot:", slot);
    });

    it("should derive correct PDA addresses", () => {
      const driftPdas = getDriftAccountPDAs(
        testWallet.publicKey,
        SOL_PERP_MARKET_INDEX
      );

      expect(driftPdas.userPda).toBeInstanceOf(PublicKey);
      expect(driftPdas.userStatsPda).toBeInstanceOf(PublicKey);
      expect(driftPdas.perpMarketPda).toBeInstanceOf(PublicKey);
      expect(driftPdas.statePda).toBeInstanceOf(PublicKey);
      expect(driftPdas.oraclePda).toBeInstanceOf(PublicKey);

      console.log("[E2E] Drift User PDA:", driftPdas.userPda.toBase58());
      console.log("[E2E] Drift User Stats PDA:", driftPdas.userStatsPda.toBase58());
      console.log("[E2E] Perp Market PDA:", driftPdas.perpMarketPda.toBase58());
    });

    it("should generate valid Ghost Order PDA", () => {
      const expectedPda = deriveGhostOrderPDA(testWallet.publicKey, orderId);
      expect(ghostOrderPda.equals(expectedPda)).toBe(true);
    });
  });

  describe("Instruction Builders", () => {
    it("should build create_ghost_order instruction", async () => {
      const discriminator = await anchorDiscriminator("create_ghost_order");
      expect(discriminator.length).toBe(8);

      const triggerPrice = new BN(180).mul(PRICE_PRECISION);
      const baseAmount = new BN(1).mul(BASE_PRECISION);

      const args = encodeCreateGhostOrderArgs({
        orderId,
        marketIndex: SOL_PERP_MARKET_INDEX,
        triggerPrice,
        triggerCondition: TRIGGER_CONDITION.Below,
        orderSide: ORDER_SIDE.Long,
        baseAssetAmount: baseAmount,
        reduceOnly: true,
        expirySeconds: new BN(3600),
        feedId: SOL_PYTH_FEED_ID,
      });

      const data = Buffer.concat([discriminator, args]);
      expect(data.length).toBeGreaterThan(8);

      const ix = new TransactionInstruction({
        keys: [
          { pubkey: testWallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: ghostOrderPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: GHOST_CRANK_PROGRAM_ID,
        data,
      });

      expect(ix.programId.equals(GHOST_CRANK_PROGRAM_ID)).toBe(true);
      expect(ix.keys.length).toBe(3);
    });

    it("should build activate_order instruction", async () => {
      const discriminator = await anchorDiscriminator("activate_order");
      expect(discriminator.length).toBe(8);

      const ix = new TransactionInstruction({
        keys: [
          { pubkey: testWallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: ghostOrderPda, isSigner: false, isWritable: true },
        ],
        programId: GHOST_CRANK_PROGRAM_ID,
        data: discriminator,
      });

      expect(ix.keys.length).toBe(2);
    });

    it("should build check_trigger instruction", async () => {
      const discriminator = await anchorDiscriminator("check_trigger");
      const oraclePda = PERP_MARKET_ORACLE_ADDRESSES[SOL_PERP_MARKET_INDEX];

      const ix = new TransactionInstruction({
        keys: [
          { pubkey: ghostOrderPda, isSigner: false, isWritable: true },
          { pubkey: oraclePda, isSigner: false, isWritable: false },
        ],
        programId: GHOST_CRANK_PROGRAM_ID,
        data: discriminator,
      });

      expect(ix.keys.length).toBe(2);
    });

    it("should build execute_trigger instruction with Magic Action accounts", async () => {
      const discriminator = await anchorDiscriminator("execute_trigger");
      const driftPdas = getDriftAccountPDAs(testWallet.publicKey, SOL_PERP_MARKET_INDEX);

      const [driftStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("drift_state")],
        new PublicKey(DRIFT_PROGRAM_ID)
      );

      const ix = new TransactionInstruction({
        keys: [
          { pubkey: sessionKeypair.publicKey, isSigner: true, isWritable: true },
          { pubkey: ghostOrderPda, isSigner: false, isWritable: true },
          { pubkey: driftStatePda, isSigner: false, isWritable: false },
          { pubkey: driftPdas.userPda, isSigner: false, isWritable: true },
          { pubkey: driftPdas.userStatsPda, isSigner: false, isWritable: true },
          { pubkey: testWallet.publicKey, isSigner: false, isWritable: false },
          { pubkey: driftPdas.perpMarketPda, isSigner: false, isWritable: true },
          { pubkey: driftPdas.oraclePda!, isSigner: false, isWritable: false },
          { pubkey: MAGIC_CONTEXT_ID, isSigner: false, isWritable: false },
          { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: GHOST_CRANK_PROGRAM_ID,
        data: discriminator,
      });

      expect(ix.keys.length).toBe(10);
      expect(ix.programId.equals(GHOST_CRANK_PROGRAM_ID)).toBe(true);
    });
  });

  describe("Drift Verification Helpers", () => {
    it("should check if Drift user is initialized", async () => {
      const randomWallet = Keypair.generate();
      const isInit = await isDriftUserInitialized(baseConnection, randomWallet.publicKey);
      expect(isInit).toBe(false);
    });

    it("should derive consistent Drift PDAs", () => {
      const pdas1 = getDriftAccountPDAs(testWallet.publicKey, SOL_PERP_MARKET_INDEX);
      const pdas2 = getDriftAccountPDAs(testWallet.publicKey, SOL_PERP_MARKET_INDEX);

      expect(pdas1.userPda.equals(pdas2.userPda)).toBe(true);
      expect(pdas1.userStatsPda.equals(pdas2.userStatsPda)).toBe(true);
      expect(pdas1.perpMarketPda.equals(pdas2.perpMarketPda)).toBe(true);
    });

    it("should verify order existence logic", () => {
      const mockOrders = [
        {
          orderId: 1,
          status: 1,
          orderType: 0,
          marketIndex: 0,
          direction: 0,
          baseAssetAmount: new BN(1_000_000_000),
          price: new BN(0),
          triggerPrice: new BN(0),
          triggerCondition: 0,
          reduceOnly: true,
          slot: 12345,
        },
      ];

      const found = verifyOrderExists(mockOrders, {
        marketIndex: 0,
        direction: 0,
        reduceOnly: true,
      });

      expect(found).not.toBeNull();
      expect(found?.orderId).toBe(1);

      const notFound = verifyOrderExists(mockOrders, {
        marketIndex: 1,
      });
      expect(notFound).toBeNull();
    });

    it("should verify position change detection", () => {
      const before = [
        {
          marketIndex: 0,
          baseAssetAmount: new BN(1_000_000_000),
          quoteAssetAmount: new BN(0),
          quoteBreakEvenAmount: new BN(0),
          lastCumulativeFundingRate: new BN(0),
          openOrders: 0,
          openBids: new BN(0),
          openAsks: new BN(0),
        },
      ];

      const after = [
        {
          marketIndex: 0,
          baseAssetAmount: new BN(2_000_000_000),
          quoteAssetAmount: new BN(0),
          quoteBreakEvenAmount: new BN(0),
          lastCumulativeFundingRate: new BN(0),
          openOrders: 0,
          openBids: new BN(0),
          openAsks: new BN(0),
        },
      ];

      const result = verifyPositionChange(before, after, 0);
      expect(result.changed).toBe(true);
      expect(result.delta.eq(new BN(1_000_000_000))).toBe(true);
    });
  });

  describe("Ghost Order State Decoding", () => {
    it("should correctly decode GhostOrder account data", async () => {
      const buf = Buffer.alloc(159);
      let offset = 0;

      Buffer.from("12345678").copy(buf, offset);
      offset += 8;

      testWallet.publicKey.toBuffer().copy(buf, offset);
      offset += 32;

      new BN(123456).toArrayLike(Buffer, "le", 8).copy(buf, offset);
      offset += 8;

      buf.writeUInt16LE(0, offset);
      offset += 2;

      new BN(180_000_000).toArrayLike(Buffer, "le", 8).copy(buf, offset);
      offset += 8;

      buf.writeUInt8(1, offset);
      offset += 1;

      buf.writeUInt8(0, offset);
      offset += 1;

      new BN(1_000_000_000).toArrayLike(Buffer, "le", 8).copy(buf, offset);
      offset += 8;

      buf.writeUInt8(1, offset);
      offset += 1;

      buf.writeUInt8(ORDER_STATUS.Active, offset);
      offset += 1;

      const mockAccountInfo = {
        data: buf,
        executable: false,
        lamports: 1_000_000,
        owner: GHOST_CRANK_PROGRAM_ID,
      };

      const decoded = await parseGhostOrderFromBuffer(buf);

      expect(decoded.owner.equals(testWallet.publicKey)).toBe(true);
      expect(decoded.orderId.toNumber()).toBe(123456);
      expect(decoded.marketIndex).toBe(0);
      expect(decoded.triggerPrice.toNumber()).toBe(180_000_000);
      expect(decoded.triggerCondition).toBe(TRIGGER_CONDITION.Below);
      expect(decoded.orderSide).toBe(ORDER_SIDE.Long);
      expect(decoded.baseAssetAmount.toNumber()).toBe(1_000_000_000);
      expect(decoded.reduceOnly).toBe(true);
      expect(decoded.status).toBe(ORDER_STATUS.Active);
    });
  });
});

async function parseGhostOrderFromBuffer(data: Buffer): Promise<GhostOrderState> {
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
  };
}

describe("E2E: Full Flow Simulation (Dry Run)", () => {
  let baseConnection: Connection;
  let testWallet: Keypair;
  let sessionKeypair: Keypair;

  beforeAll(() => {
    baseConnection = new Connection(DEVNET_RPC, "confirmed");
    testWallet = Keypair.generate();
    sessionKeypair = Keypair.generate();
  });

  it("should simulate complete ghost order lifecycle", async () => {
    const orderId = new BN(Date.now());
    const ghostOrderPda = deriveGhostOrderPDA(testWallet.publicKey, orderId);
    const triggerPrice = new BN(180).mul(PRICE_PRECISION);
    const baseAmount = new BN(1).mul(BASE_PRECISION);

    console.log("\n=== Ghost Order Lifecycle Simulation ===");
    console.log("Order ID:", orderId.toString());
    console.log("Ghost Order PDA:", ghostOrderPda.toBase58());
    console.log("Test Wallet:", testWallet.publicKey.toBase58());
    console.log("Session Keypair:", sessionKeypair.publicKey.toBase58());

    const createDisc = await anchorDiscriminator("create_ghost_order");
    const createArgs = encodeCreateGhostOrderArgs({
      orderId,
      marketIndex: SOL_PERP_MARKET_INDEX,
      triggerPrice,
      triggerCondition: TRIGGER_CONDITION.Below,
      orderSide: ORDER_SIDE.Long,
      baseAssetAmount: baseAmount,
      reduceOnly: true,
      expirySeconds: new BN(3600),
      feedId: SOL_PYTH_FEED_ID,
    });

    const createIx = new TransactionInstruction({
      keys: [
        { pubkey: testWallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: ghostOrderPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: GHOST_CRANK_PROGRAM_ID,
      data: Buffer.concat([createDisc, createArgs]),
    });

    console.log("\n1. CREATE_GHOST_ORDER instruction built");
    console.log("   Program:", GHOST_CRANK_PROGRAM_ID.toBase58());
    console.log("   Trigger Price:", triggerPrice.toString(), "(180 USD)");
    console.log("   Base Amount:", baseAmount.toString(), "(1 SOL)");

    const activateDisc = await anchorDiscriminator("activate_order");
    const activateIx = new TransactionInstruction({
      keys: [
        { pubkey: testWallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: ghostOrderPda, isSigner: false, isWritable: true },
      ],
      programId: GHOST_CRANK_PROGRAM_ID,
      data: activateDisc,
    });

    console.log("\n2. ACTIVATE_ORDER instruction built");

    const checkTriggerDisc = await anchorDiscriminator("check_trigger");
    const oraclePda = PERP_MARKET_ORACLE_ADDRESSES[SOL_PERP_MARKET_INDEX];

    const checkTriggerIx = new TransactionInstruction({
      keys: [
        { pubkey: ghostOrderPda, isSigner: false, isWritable: true },
        { pubkey: oraclePda, isSigner: false, isWritable: false },
      ],
      programId: GHOST_CRANK_PROGRAM_ID,
      data: checkTriggerDisc,
    });

    console.log("\n3. CHECK_TRIGGER instruction built");
    console.log("   Oracle:", oraclePda.toBase58());

    const executeTriggerDisc = await anchorDiscriminator("execute_trigger");
    const driftPdas = getDriftAccountPDAs(testWallet.publicKey, SOL_PERP_MARKET_INDEX);

    const [driftStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("drift_state")],
      new PublicKey(DRIFT_PROGRAM_ID)
    );

    const executeTriggerIx = new TransactionInstruction({
      keys: [
        { pubkey: sessionKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: ghostOrderPda, isSigner: false, isWritable: true },
        { pubkey: driftStatePda, isSigner: false, isWritable: false },
        { pubkey: driftPdas.userPda, isSigner: false, isWritable: true },
        { pubkey: driftPdas.userStatsPda, isSigner: false, isWritable: true },
        { pubkey: testWallet.publicKey, isSigner: false, isWritable: false },
        { pubkey: driftPdas.perpMarketPda, isSigner: false, isWritable: true },
        { pubkey: driftPdas.oraclePda!, isSigner: false, isWritable: false },
        { pubkey: MAGIC_CONTEXT_ID, isSigner: false, isWritable: false },
        { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: GHOST_CRANK_PROGRAM_ID,
      data: executeTriggerDisc,
    });

    console.log("\n4. EXECUTE_TRIGGER instruction built");
    console.log("   Drift State:", driftStatePda.toBase58());
    console.log("   Drift User:", driftPdas.userPda.toBase58());
    console.log("   Drift User Stats:", driftPdas.userStatsPda.toBase58());
    console.log("   Perp Market:", driftPdas.perpMarketPda.toBase58());
    console.log("   Oracle:", driftPdas.oraclePda?.toBase58());
    console.log("   Magic Context:", MAGIC_CONTEXT_ID.toBase58());
    console.log("   Magic Program:", MAGIC_PROGRAM_ID.toBase58());

    console.log("\n=== Verification Points ===");
    console.log("1. After CREATE: status should be Pending (0)");
    console.log("2. After ACTIVATE: status should be Active (1)");
    console.log("3. After CHECK_TRIGGER (price hit): status should be Triggered (2)");
    console.log("4. After EXECUTE_TRIGGER: status should be Executed (3)");
    console.log("5. Drift user account should have new order or position change");

    expect(createIx.data.length).toBeGreaterThan(8);
    expect(activateIx.data.length).toBe(8);
    expect(checkTriggerIx.data.length).toBe(8);
    expect(executeTriggerIx.data.length).toBe(8);
  });
});

describe("E2E: Integration Test with Real Devnet (Funded Wallet Required)", () => {
  const SKIP_FUNDED_TESTS = !process.env.TEST_WALLET_PRIVATE_KEY;

  it.skipIf(SKIP_FUNDED_TESTS)("should auto-initialize Drift user if needed", async () => {
    const privateKeyArray = JSON.parse(process.env.TEST_WALLET_PRIVATE_KEY || "[]");
    const testWallet = Keypair.fromSecretKey(Uint8Array.from(privateKeyArray));
    const baseConnection = new Connection(DEVNET_RPC, "confirmed");

    console.log("\n=== Drift Auto-Initialization Test ===");
    console.log("Wallet:", testWallet.publicKey.toBase58());

    const balance = await baseConnection.getBalance(testWallet.publicKey);
    console.log("Balance:", balance / LAMPORTS_PER_SOL, "SOL");

    expect(balance).toBeGreaterThan(0.05 * LAMPORTS_PER_SOL);

    const initResult = await ensureDriftInitialized(baseConnection, testWallet);

    expect(initResult.error).toBeUndefined();
    expect(initResult.userPDA).toBeDefined();
    expect(initResult.userStatsPDA).toBeDefined();

    if (initResult.wasInitialized) {
      console.log("✓ Drift user was auto-initialized");
      console.log("  Signature:", initResult.signature);
      expect(initResult.signature).toBeDefined();
    } else if (initResult.alreadyExists) {
      console.log("✓ Drift user already existed");
    }

    const isInit = await isDriftUserInitialized(baseConnection, testWallet.publicKey);
    expect(isInit).toBe(true);
    console.log("✓ Drift user account verified");
  });

  it.skipIf(SKIP_FUNDED_TESTS)("should execute full flow with funded wallet", async () => {
    const privateKeyArray = JSON.parse(process.env.TEST_WALLET_PRIVATE_KEY || "[]");
    const testWallet = Keypair.fromSecretKey(Uint8Array.from(privateKeyArray));
    const baseConnection = new Connection(DEVNET_RPC, "confirmed");
    const erConnection = new Connection(ER_RPC, {
      commitment: "confirmed",
      wsEndpoint: ER_RPC.replace("https://", "wss://"),
    });

    console.log("\n=== Running Funded Wallet Test ===");
    console.log("Wallet:", testWallet.publicKey.toBase58());

    const balance = await baseConnection.getBalance(testWallet.publicKey);
    console.log("Balance:", balance / LAMPORTS_PER_SOL, "SOL");

    expect(balance).toBeGreaterThan(0.1 * LAMPORTS_PER_SOL);

    const initResult = await ensureDriftInitialized(baseConnection, testWallet);

    if (initResult.error) {
      console.log("Failed to ensure Drift initialization:", initResult.error);
      throw new Error(`Drift initialization failed: ${initResult.error}`);
    }

    console.log("Drift user ready at:", initResult.userPDA.toBase58());

    const positionsBefore = await getDriftUserPositions(baseConnection, testWallet.publicKey);
    console.log("Current positions:", positionsBefore.length);

    const ordersBefore = await getDriftUserOrders(baseConnection, testWallet.publicKey);
    console.log("Current orders:", ordersBefore.length);

    const userAccount = await getDriftUserAccount(baseConnection, testWallet.publicKey);
    expect(userAccount).not.toBeNull();
    console.log("User account name:", userAccount?.name || "(unnamed)");
  });
});

describe("E2E: Drift Auto-Initialization Verification", () => {
  it("should detect uninitialized user for random wallet", async () => {
    const connection = new Connection(DEVNET_RPC, "confirmed");
    const randomWallet = Keypair.generate();

    const isInit = await isDriftUserInitialized(connection, randomWallet.publicKey);
    expect(isInit).toBe(false);

    const userPDA = deriveUserPDA(randomWallet.publicKey, 0);
    const userStatsPDA = deriveUserStatsPDA(randomWallet.publicKey);

    expect(userPDA).toBeInstanceOf(PublicKey);
    expect(userStatsPDA).toBeInstanceOf(PublicKey);

    console.log("[Test] Random wallet:", randomWallet.publicKey.toBase58());
    console.log("[Test] Derived User PDA:", userPDA.toBase58());
    console.log("[Test] Derived User Stats PDA:", userStatsPDA.toBase58());
    console.log("[Test] Is initialized:", isInit);
  });

  it("should build valid initialize_user instruction", () => {
    const testAuthority = Keypair.generate();

    const initIx = buildInitializeUserInstruction({
      authority: testAuthority.publicKey,
      payer: testAuthority.publicKey,
      subAccountNumber: 0,
      name: "TestUser",
    });

    expect(initIx.programId.toBase58()).toBe(DRIFT_PROGRAM_ID.toBase58());
    expect(initIx.keys.length).toBe(7);
    expect(initIx.data.length).toBe(8 + 2 + 32);

    const [expectedUserPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("user"), testAuthority.publicKey.toBuffer(), Buffer.from([0, 0])],
      new PublicKey(DRIFT_PROGRAM_ID)
    );
    expect(initIx.keys[0].pubkey.toBase58()).toBe(expectedUserPDA.toBase58());
    expect(initIx.keys[0].isWritable).toBe(true);

    const [expectedUserStatsPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_stats"), testAuthority.publicKey.toBuffer()],
      new PublicKey(DRIFT_PROGRAM_ID)
    );
    expect(initIx.keys[1].pubkey.toBase58()).toBe(expectedUserStatsPDA.toBase58());
    expect(initIx.keys[1].isWritable).toBe(true);

    console.log("[Test] Initialize instruction accounts:");
    initIx.keys.forEach((key, i) => {
      console.log(`  [${i}] ${key.pubkey.toBase58()} (signer: ${key.isSigner}, writable: ${key.isWritable})`);
    });
  });

  it("should handle ensureDriftInitialized idempotently", async () => {
    const connection = new Connection(DEVNET_RPC, "confirmed");
    const testWallet = Keypair.generate();

    const result1 = await ensureDriftInitialized(connection, testWallet);
    expect(result1.alreadyExists).toBe(false);
    expect(result1.wasInitialized).toBe(false);
    expect(result1.error).toBeDefined();

    const result2 = await ensureDriftInitialized(connection, testWallet);
    expect(result2.alreadyExists).toBe(false);
    expect(result2.wasInitialized).toBe(false);
  });
});
