"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useWalletConnection, useWalletActions } from "@solana/react-hooks";
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
import { BN } from "@coral-xyz/anchor";
import {
  toPublicKey,
  createConnection,
  buildVersionedTransaction,
  serializeTransactionBase64,
  confirmTransaction,
} from "../lib/solana-adapter";
import type {
  OnChainGhostOrder,
  GhostOrderDisplay,
  CreateGhostOrderParams,
  GhostOrderResult,
} from "../types/ghost-order";
import {
  mapOrderTypeToOnChain,
  toDisplayOrder,
} from "../types/ghost-order";

export const MAGICBLOCK_ER_RPC = "https://devnet.magicblock.app";
export const SOLANA_DEVNET_RPC = "https://api.devnet.solana.com";
export const MAGIC_PROGRAM_ID = SDK_MAGIC_PROGRAM_ID.toBase58();
export const MAGIC_CONTEXT_ID = SDK_MAGIC_CONTEXT_ID.toBase58();
export const DELEGATION_PROGRAM_ID = SDK_DELEGATION_PROGRAM_ID.toBase58();

const GHOST_CRANK_PROGRAM_ID = "7VvD7j99AE7q9PC9atpJeMEUeEzZ5ZYH7WqSzGdmvsqv";
const DRIFT_PROGRAM_ID = "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH";
const DEFAULT_EXPIRY_MINUTES = 60;
const EXPIRY_CHECK_INTERVAL_MS = 30000;
const COMMIT_FREQUENCY_MS = 30000;
const STATE_PROPAGATION_DELAY_MS = 3000;
const ORDER_POLL_INTERVAL_MS = 10000;

const MARKET_TOKEN_MAP: Record<number, string> = {
  0: "SOL",
  1: "BTC",
  2: "ETH",
};

export type MagicBlockStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "expired"
  | "error";

export type DelegationStatus =
  | "undelegated"
  | "delegating"
  | "delegated"
  | "committing"
  | "error";

interface SessionInfo {
  publicKey: string;
  expiry: number;
  targetProgramId: string;
}

interface DelegationPDAs {
  delegationBuffer: string;
  delegationRecord: string;
  delegationMetadata: string;
}

export interface ExecuteTriggerParams {
  orderId: number;
  marketIndex: number;
  driftUserPda: string;
  driftUserStatsPda: string;
  perpMarketPda: string;
  oraclePda: string;
  redelegateAfterExecution?: boolean;
  delegationBuffer?: string;
  delegationRecord?: string;
  delegationMetadata?: string;
}

export interface UseMagicBlockReturn {
  isSessionActive: boolean;
  sessionExpiry: Date | null;
  sessionPublicKey: string | null;
  status: MagicBlockStatus;
  error: string | null;

  createSession: (targetProgramId: string, expiryMinutes?: number) => Promise<boolean>;
  endSession: () => Promise<void>;

  isPrivacyModeEnabled: boolean;
  enablePrivacyMode: () => void;
  disablePrivacyMode: () => void;

  delegationStatus: DelegationStatus;
  delegatedAccount: string | null;
  delegateVaultToER: (vaultPda: string) => Promise<string | null>;
  commitAndUndelegate: () => Promise<string | null>;

  sessionBalance: number | null;
  fundSession: (amountLamports: number) => Promise<string | null>;
  getSessionBalance: () => Promise<number>;

  ghostOrders: GhostOrderDisplay[];
  isLoadingOrders: boolean;
  createGhostOrder: (params: CreateGhostOrderParams) => Promise<GhostOrderResult>;
  cancelGhostOrder: (orderId: number) => Promise<GhostOrderResult>;
  activateAndMonitor: (orderId: number, checkIntervalMs?: number, maxIterations?: number) => Promise<GhostOrderResult>;
  executeTrigger: (params: ExecuteTriggerParams) => Promise<GhostOrderResult>;
  fetchGhostOrders: () => Promise<void>;

  erConnection: unknown | null;
  baseConnection: unknown | null;
}

// Anchor instruction discriminator: first 8 bytes of SHA-256("global:<snake_case_name>")
async function anchorDiscriminator(name: string): Promise<Buffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`global:${name}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(new Uint8Array(hashBuffer).slice(0, 8));
}

function encodeCreateGhostOrderArgs(args: {
  orderId: BN;
  marketIndex: number;
  triggerPrice: BN;
  triggerCondition: { above: {} } | { below: {} };
  orderSide: { long: {} } | { short: {} };
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

  buf.writeUInt8("above" in args.triggerCondition ? 0 : 1, offset);
  offset += 1;

  buf.writeUInt8("long" in args.orderSide ? 0 : 1, offset);
  offset += 1;

  args.baseAssetAmount.toArrayLike(Buffer, "le", 8).copy(buf, offset);
  offset += 8;

  buf.writeUInt8(args.reduceOnly ? 1 : 0, offset);
  offset += 1;

  args.expirySeconds.toArrayLike(Buffer, "le", 8).copy(buf, offset);
  offset += 8;

  Buffer.from(args.feedId).copy(buf, offset);
  offset += 32;

  return buf.subarray(0, offset);
}

function encodeScheduleMonitoringArgs(args: {
  taskId: BN;
  checkIntervalMillis: BN;
  maxIterations: BN;
}): Buffer {
  const buf = Buffer.alloc(24);
  let offset = 0;

  args.taskId.toArrayLike(Buffer, "le", 8).copy(buf, offset);
  offset += 8;

  args.checkIntervalMillis.toArrayLike(Buffer, "le", 8).copy(buf, offset);
  offset += 8;

  args.maxIterations.toArrayLike(Buffer, "le", 8).copy(buf, offset);

  return buf;
}

function decodeGhostOrder(
  data: Buffer,
  PublicKeyClass: typeof import("@solana/web3.js").PublicKey
): OnChainGhostOrder {
  let offset = 8; // skip Anchor discriminator

  const owner = new PublicKeyClass(data.subarray(offset, offset + 32));
  offset += 32;

  const orderId = new BN(data.subarray(offset, offset + 8), "le");
  offset += 8;

  const marketIndex = data.readUInt16LE(offset);
  offset += 2;

  const triggerPrice = new BN(data.subarray(offset, offset + 8), "le");
  offset += 8;

  const triggerConditionByte = data.readUInt8(offset);
  offset += 1;
  const triggerCondition = triggerConditionByte === 0 ? { above: {} } : { below: {} };

  const orderSideByte = data.readUInt8(offset);
  offset += 1;
  const orderSide = orderSideByte === 0 ? { long: {} } : { short: {} };

  const baseAssetAmount = new BN(data.subarray(offset, offset + 8), "le");
  offset += 8;

  const reduceOnly = data.readUInt8(offset) === 1;
  offset += 1;

  const statusByte = data.readUInt8(offset);
  offset += 1;
  const statusMap: Record<number, OnChainGhostOrder["status"]> = {
    0: { pending: {} },
    1: { active: {} },
    2: { triggered: {} },
    3: { executed: {} },
    4: { cancelled: {} },
    5: { expired: {} },
  };
  const status = statusMap[statusByte] ?? { pending: {} };

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
}

async function deriveDelegationPDAs(
  accountPubkey: string,
  ownerProgramId: string
): Promise<DelegationPDAs> {
  const { PublicKey } = await import("@solana/web3.js");

  const accountKey = new PublicKey(accountPubkey);
  const ownerKey = new PublicKey(ownerProgramId);

  const delegationBuffer = delegateBufferPdaFromDelegatedAccountAndOwnerProgram(
    accountKey,
    ownerKey
  );
  const delegationRecord = delegationRecordPdaFromDelegatedAccount(accountKey);
  const delegationMetadata = delegationMetadataPdaFromDelegatedAccount(accountKey);

  return {
    delegationBuffer: delegationBuffer.toBase58(),
    delegationRecord: delegationRecord.toBase58(),
    delegationMetadata: delegationMetadata.toBase58(),
  };
}

export function useMagicBlock(): UseMagicBlockReturn {
  const { wallet, status: walletStatus } = useWalletConnection();
  const walletActions = useWalletActions();

  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [status, setStatus] = useState<MagicBlockStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [isPrivacyModeEnabled, setIsPrivacyModeEnabled] = useState(false);

  const [delegationStatus, setDelegationStatus] = useState<DelegationStatus>("undelegated");
  const [delegatedAccount, setDelegatedAccount] = useState<string | null>(null);

  const [erConnection, setErConnection] = useState<unknown | null>(null);
  const [baseConnection, setBaseConnection] = useState<unknown | null>(null);
  const [sessionBalance, setSessionBalance] = useState<number | null>(null);

  const [ghostOrders, setGhostOrders] = useState<GhostOrderDisplay[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  const sessionKeypairRef = useRef<unknown | null>(null);
  const erConnectionRef = useRef<import("@solana/web3.js").Connection | null>(null);
  const isSendingRef = useRef(false);

  const walletAddress = wallet?.account.address;

  useEffect(() => {
    let cancelled = false;

    async function initConnections() {
      try {
        const { Connection } = await import("@solana/web3.js");

        const erConn = new Connection(MAGICBLOCK_ER_RPC, {
          commitment: "confirmed",
          wsEndpoint: MAGICBLOCK_ER_RPC.replace("https://", "wss://"),
        });

        const baseConn = new Connection(SOLANA_DEVNET_RPC, "confirmed");

        if (!cancelled) {
          setErConnection(erConn);
          erConnectionRef.current = erConn;
          setBaseConnection(baseConn);
        }
      } catch (err) {
        console.error("[MagicBlock] Failed to initialize connections:", err);
      }
    }

    initConnections();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionInfo || status !== "connected") return;

    const checkExpiry = () => {
      if (Date.now() > sessionInfo.expiry) {
        setStatus("expired");
        sessionKeypairRef.current = null;
      }
    };

    const interval = setInterval(checkExpiry, EXPIRY_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [sessionInfo, status]);

  useEffect(() => {
    if (!walletAddress || !sessionInfo || status !== "connected") return;

    const interval = setInterval(() => {
      fetchGhostOrders();
    }, ORDER_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [walletAddress, sessionInfo, status]);

  const isSessionActive = useMemo(() => {
    return (
      status === "connected" &&
      sessionInfo !== null &&
      Date.now() < sessionInfo.expiry
    );
  }, [status, sessionInfo]);

  const sessionExpiry = useMemo(() => {
    if (!sessionInfo) return null;
    return new Date(sessionInfo.expiry);
  }, [sessionInfo]);

  const sessionPublicKey = useMemo(() => {
    if (!sessionInfo) return null;
    return sessionInfo.publicKey;
  }, [sessionInfo]);

  const createSession = useCallback(
    async (targetProgramId: string, expiryMinutes = DEFAULT_EXPIRY_MINUTES): Promise<boolean> => {
      if (!walletAddress) {
        setError("Wallet not connected");
        setStatus("error");
        return false;
      }

      setStatus("connecting");
      setError(null);

      try {
        const { Keypair } = await import("@solana/web3.js");
        const keypair = Keypair.generate();
        sessionKeypairRef.current = keypair;

        const expiry = Date.now() + expiryMinutes * 60 * 1000;

        setSessionInfo({
          publicKey: keypair.publicKey.toBase58(),
          expiry,
          targetProgramId,
        });
        setStatus("connected");

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create session";
        setError(message);
        setStatus("error");
        return false;
      }
    },
    [walletAddress]
  );

  const endSession = useCallback(async (): Promise<void> => {
    try {
      if (delegationStatus === "delegated") {
        await commitAndUndelegate();
      }

      sessionKeypairRef.current = null;
      setSessionInfo(null);
      setStatus("disconnected");
      setError(null);
      setDelegationStatus("undelegated");
      setDelegatedAccount(null);
      setGhostOrders([]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to end session";
      setError(message);
      setStatus("error");
    }
  }, [delegationStatus]);

  const enablePrivacyMode = useCallback(() => {
    setIsPrivacyModeEnabled(true);
  }, []);

  const disablePrivacyMode = useCallback(() => {
    setIsPrivacyModeEnabled(false);
  }, []);

  const delegateVaultToER = useCallback(
    async (vaultPda: string): Promise<string | null> => {
      if (!walletAddress) {
        setError("Wallet not connected");
        return null;
      }

      if (!isSessionActive || !sessionInfo) {
        setError("No active session");
        return null;
      }

      if (isSendingRef.current) {
        setError("Transaction already in progress");
        return null;
      }

      setDelegationStatus("delegating");
      setError(null);
      isSendingRef.current = true;

      try {
        const { PublicKey } = await import("@solana/web3.js");

        const pdas = await deriveDelegationPDAs(vaultPda, sessionInfo.targetProgramId);

        const vaultPubkey = new PublicKey(vaultPda);
        const ownerProgramPubkey = new PublicKey(sessionInfo.targetProgramId);
        const payerPubkey = await toPublicKey(walletAddress);

        const delegateIx = createDelegateInstruction(
          {
            payer: payerPubkey,
            delegatedAccount: vaultPubkey,
            ownerProgram: ownerProgramPubkey,
          },
          {
            commitFrequencyMs: COMMIT_FREQUENCY_MS,
          }
        );

        const connection = await createConnection(SOLANA_DEVNET_RPC);

        const { transaction, blockhash, lastValidBlockHeight } =
          await buildVersionedTransaction(connection, payerPubkey, [delegateIx]);

        const base64Tx = serializeTransactionBase64(transaction);

        const signature = await walletActions.sendTransaction(
          base64Tx as never,
          "confirmed"
        );

        const confirmation = await confirmTransaction(
          connection,
          signature as string,
          blockhash,
          lastValidBlockHeight,
          "confirmed"
        );

        if (!confirmation.confirmed) {
          throw new Error(confirmation.error || "Transaction confirmation failed");
        }

        setDelegatedAccount(vaultPda);
        setDelegationStatus("delegated");

        return signature as string;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to delegate to ER";
        setError(message);
        setDelegationStatus("error");
        return null;
      } finally {
        isSendingRef.current = false;
      }
    },
    [walletAddress, isSessionActive, sessionInfo, walletActions]
  );

  const commitAndUndelegate = useCallback(async (): Promise<string | null> => {
    if (delegationStatus !== "delegated") {
      setError("No account delegated");
      return null;
    }

    if (!sessionKeypairRef.current || !delegatedAccount) {
      setError("ER session not properly initialized");
      return null;
    }

    if (isSendingRef.current) {
      setError("Transaction already in progress");
      return null;
    }

    setDelegationStatus("committing");
    setError(null);
    isSendingRef.current = true;

    try {
      const { Transaction, PublicKey, Connection } = await import("@solana/web3.js");

      const sessionKeypair = sessionKeypairRef.current as import("@solana/web3.js").Keypair;
      const accountPubkey = new PublicKey(delegatedAccount);

      const undelegateIx = createCommitAndUndelegateInstruction(
        sessionKeypair.publicKey,
        [accountPubkey]
      );

      const tx = new Transaction().add(undelegateIx);

      const erConn = new Connection(MAGICBLOCK_ER_RPC, {
        commitment: "confirmed",
        wsEndpoint: MAGICBLOCK_ER_RPC.replace("https://", "wss://"),
      });

      const { blockhash } = await erConn.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = sessionKeypair.publicKey;
      tx.sign(sessionKeypair);

      const signature = await erConn.sendRawTransaction(tx.serialize(), {
        skipPreflight: true,
        preflightCommitment: "confirmed",
      });

      await erConn.confirmTransaction(signature, "confirmed");

      await new Promise((resolve) => setTimeout(resolve, STATE_PROPAGATION_DELAY_MS));

      setDelegatedAccount(null);
      setDelegationStatus("undelegated");

      return signature;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to commit and undelegate";
      setError(message);
      setDelegationStatus("error");
      return null;
    } finally {
      isSendingRef.current = false;
    }
  }, [delegationStatus, delegatedAccount]);

  const getSessionBalance = useCallback(async (): Promise<number> => {
    if (!sessionKeypairRef.current) return 0;

    try {
      const { Connection } = await import("@solana/web3.js");
      const sessionKeypair = sessionKeypairRef.current as import("@solana/web3.js").Keypair;

      const erConn = new Connection(MAGICBLOCK_ER_RPC, "confirmed");
      const balance = await erConn.getBalance(sessionKeypair.publicKey);

      setSessionBalance(balance);
      return balance;
    } catch (err) {
      console.error("[MagicBlock] Failed to get session balance:", err);
      return 0;
    }
  }, []);

  const fundSession = useCallback(
    async (amountLamports: number): Promise<string | null> => {
      if (!walletAddress) {
        setError("Wallet not connected");
        return null;
      }

      if (!sessionKeypairRef.current || !sessionInfo) {
        setError("No active session to fund");
        return null;
      }

      if (isSendingRef.current) {
        setError("Transaction already in progress");
        return null;
      }

      setError(null);
      isSendingRef.current = true;

      try {
        const sessionKeypair = sessionKeypairRef.current as import("@solana/web3.js").Keypair;
        const payerPubkey = await toPublicKey(walletAddress);

        const escrowPda = escrowPdaFromEscrowAuthority(sessionKeypair.publicKey);

        const topUpIx = createTopUpEscrowInstruction(
          escrowPda,
          sessionKeypair.publicKey,
          payerPubkey,
          amountLamports
        );

        const connection = await createConnection(SOLANA_DEVNET_RPC);

        const { transaction, blockhash, lastValidBlockHeight } =
          await buildVersionedTransaction(connection, payerPubkey, [topUpIx]);

        const base64Tx = serializeTransactionBase64(transaction);

        const signature = await walletActions.sendTransaction(
          base64Tx as never,
          "confirmed"
        );

        const confirmation = await confirmTransaction(
          connection,
          signature as string,
          blockhash,
          lastValidBlockHeight,
          "confirmed"
        );

        if (!confirmation.confirmed) {
          throw new Error(confirmation.error || "Transaction confirmation failed");
        }

        await getSessionBalance();

        return signature as string;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fund session";
        setError(message);
        return null;
      } finally {
        isSendingRef.current = false;
      }
    },
    [walletAddress, sessionInfo, walletActions, getSessionBalance]
  );

  const fetchGhostOrders = useCallback(async () => {
    if (!walletAddress) return;

    setIsLoadingOrders(true);

    try {
      const { PublicKey, Connection } = await import("@solana/web3.js");
      const programId = new PublicKey(GHOST_CRANK_PROGRAM_ID);
      const ownerPubkey = await toPublicKey(walletAddress);

      const conn =
        erConnectionRef.current || (await createConnection(SOLANA_DEVNET_RPC));

      const accounts = await conn.getProgramAccounts(programId, {
        filters: [
          { dataSize: 159 },
          { memcmp: { offset: 8, bytes: ownerPubkey.toBase58() } },
        ],
      });

      const orders = accounts.map(({ pubkey, account }) => {
        const decoded = decodeGhostOrder(account.data as Buffer, PublicKey);
        return toDisplayOrder(decoded, pubkey.toBase58(), MARKET_TOKEN_MAP);
      });

      setGhostOrders(orders);
    } catch (err) {
      console.error("[MagicBlock] Failed to fetch ghost orders:", err);
    } finally {
      setIsLoadingOrders(false);
    }
  }, [walletAddress]);

  const createGhostOrder = useCallback(
    async (params: CreateGhostOrderParams): Promise<GhostOrderResult> => {
      if (!walletAddress) {
        return { success: false, error: "Wallet not connected" };
      }

      try {
        const { PublicKey, SystemProgram, TransactionInstruction } =
          await import("@solana/web3.js");

        const orderId = Date.now();
        const { triggerCondition, orderSide } = mapOrderTypeToOnChain(
          params.type,
          params.direction
        );
        const triggerPriceScaled = new BN(Math.round(params.triggerPrice * 1e6));
        const baseAssetAmount = new BN(params.size.toString());
        const expirySeconds = new BN(
          (params.expiryMinutes || DEFAULT_EXPIRY_MINUTES) * 60
        );

        const ownerPubkey = await toPublicKey(walletAddress);
        const programId = new PublicKey(GHOST_CRANK_PROGRAM_ID);

        const [ghostOrderPda] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("ghost_order"),
            ownerPubkey.toBuffer(),
            new BN(orderId).toArrayLike(Buffer, "le", 8),
          ],
          programId
        );

        const discriminator = await anchorDiscriminator("create_ghost_order");
        const argsData = encodeCreateGhostOrderArgs({
          orderId: new BN(orderId),
          marketIndex: params.marketIndex,
          triggerPrice: triggerPriceScaled,
          triggerCondition,
          orderSide,
          baseAssetAmount,
          reduceOnly: params.reduceOnly ?? false,
          expirySeconds,
          feedId: params.feedId,
        });

        const data = Buffer.concat([discriminator, argsData]);

        const createIx = new TransactionInstruction({
          keys: [
            { pubkey: ownerPubkey, isSigner: true, isWritable: true },
            { pubkey: ghostOrderPda, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          programId,
          data,
        });

        const connection = await createConnection(SOLANA_DEVNET_RPC);

        const { transaction, blockhash, lastValidBlockHeight } =
          await buildVersionedTransaction(connection, ownerPubkey, [createIx]);

        const base64Tx = serializeTransactionBase64(transaction);
        const signature = await walletActions.sendTransaction(
          base64Tx as never,
          "confirmed"
        );

        const confirmation = await confirmTransaction(
          connection,
          signature as string,
          blockhash,
          lastValidBlockHeight,
          "confirmed"
        );

        if (!confirmation.confirmed) {
          throw new Error(confirmation.error || "Transaction confirmation failed");
        }

        await fetchGhostOrders();
        return { success: true, signature: signature as string };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create ghost order";
        return { success: false, error: message };
      }
    },
    [walletAddress, walletActions, fetchGhostOrders]
  );

  const cancelGhostOrder = useCallback(
    async (orderId: number): Promise<GhostOrderResult> => {
      if (!walletAddress) {
        return { success: false, error: "Wallet not connected" };
      }

      try {
        const { PublicKey, TransactionInstruction } = await import("@solana/web3.js");

        const ownerPubkey = await toPublicKey(walletAddress);
        const programId = new PublicKey(GHOST_CRANK_PROGRAM_ID);

        const [ghostOrderPda] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("ghost_order"),
            ownerPubkey.toBuffer(),
            new BN(orderId).toArrayLike(Buffer, "le", 8),
          ],
          programId
        );

        const discriminator = await anchorDiscriminator("cancel_order");

        const cancelIx = new TransactionInstruction({
          keys: [
            { pubkey: ownerPubkey, isSigner: true, isWritable: true },
            { pubkey: ghostOrderPda, isSigner: false, isWritable: true },
          ],
          programId,
          data: discriminator,
        });

        const connection = await createConnection(SOLANA_DEVNET_RPC);

        const { transaction, blockhash, lastValidBlockHeight } =
          await buildVersionedTransaction(connection, ownerPubkey, [cancelIx]);

        const base64Tx = serializeTransactionBase64(transaction);
        const signature = await walletActions.sendTransaction(
          base64Tx as never,
          "confirmed"
        );

        const confirmation = await confirmTransaction(
          connection,
          signature as string,
          blockhash,
          lastValidBlockHeight,
          "confirmed"
        );

        if (!confirmation.confirmed) {
          throw new Error(confirmation.error || "Transaction confirmation failed");
        }

        await fetchGhostOrders();
        return { success: true, signature: signature as string };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to cancel ghost order";
        return { success: false, error: message };
      }
    },
    [walletAddress, walletActions, fetchGhostOrders]
  );

  const activateAndMonitor = useCallback(
    async (
      orderId: number,
      checkIntervalMs = 500,
      maxIterations = 1000
    ): Promise<GhostOrderResult> => {
      if (!walletAddress) {
        return { success: false, error: "Wallet not connected" };
      }

      try {
        const { PublicKey, TransactionInstruction } = await import("@solana/web3.js");

        const ownerPubkey = await toPublicKey(walletAddress);
        const programId = new PublicKey(GHOST_CRANK_PROGRAM_ID);

        const [ghostOrderPda] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("ghost_order"),
            ownerPubkey.toBuffer(),
            new BN(orderId).toArrayLike(Buffer, "le", 8),
          ],
          programId
        );

        // Activate instruction
        const activateDisc = await anchorDiscriminator("activate_order");
        const activateIx = new TransactionInstruction({
          keys: [
            { pubkey: ownerPubkey, isSigner: true, isWritable: true },
            { pubkey: ghostOrderPda, isSigner: false, isWritable: true },
          ],
          programId,
          data: activateDisc,
        });

        // Schedule monitoring instruction
        const scheduleDisc = await anchorDiscriminator("schedule_monitoring");
        const taskId = new BN(Date.now());
        const scheduleArgs = encodeScheduleMonitoringArgs({
          taskId,
          checkIntervalMillis: new BN(checkIntervalMs),
          maxIterations: new BN(maxIterations),
        });
        const scheduleData = Buffer.concat([scheduleDisc, scheduleArgs]);

        const magicProgramPubkey = new PublicKey(MAGIC_PROGRAM_ID);

        // Use placeholder price feed — real feed ID comes from params in production
        const priceFeedPubkey = PublicKey.default;

        const scheduleIx = new TransactionInstruction({
          keys: [
            { pubkey: ownerPubkey, isSigner: true, isWritable: true },
            { pubkey: ghostOrderPda, isSigner: false, isWritable: true },
            { pubkey: priceFeedPubkey, isSigner: false, isWritable: false },
            { pubkey: magicProgramPubkey, isSigner: false, isWritable: false },
          ],
          programId,
          data: scheduleData,
        });

        const connection = await createConnection(SOLANA_DEVNET_RPC);

        const { transaction, blockhash, lastValidBlockHeight } =
          await buildVersionedTransaction(connection, ownerPubkey, [
            activateIx,
            scheduleIx,
          ]);

        const base64Tx = serializeTransactionBase64(transaction);
        const signature = await walletActions.sendTransaction(
          base64Tx as never,
          "confirmed"
        );

        const confirmation = await confirmTransaction(
          connection,
          signature as string,
          blockhash,
          lastValidBlockHeight,
          "confirmed"
        );

        if (!confirmation.confirmed) {
          throw new Error(confirmation.error || "Transaction confirmation failed");
        }

        await fetchGhostOrders();
        return { success: true, signature: signature as string };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to activate and monitor order";
        return { success: false, error: message };
      }
    },
    [walletAddress, walletActions, fetchGhostOrders]
  );

  const executeTrigger = useCallback(
    async (params: ExecuteTriggerParams): Promise<GhostOrderResult> => {
      if (!sessionKeypairRef.current) {
        return { success: false, error: "No active ER session" };
      }

      try {
        const { PublicKey, TransactionInstruction, Transaction, Connection } =
          await import("@solana/web3.js");

        const sessionKeypair = sessionKeypairRef.current as import("@solana/web3.js").Keypair;
        const programId = new PublicKey(GHOST_CRANK_PROGRAM_ID);
        const ownerPubkey = sessionKeypair.publicKey;

        const [ghostOrderPda] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("ghost_order"),
            ownerPubkey.toBuffer(),
            new BN(params.orderId).toArrayLike(Buffer, "le", 8),
          ],
          programId
        );

        const driftStatePda = PublicKey.findProgramAddressSync(
          [Buffer.from("drift_state")],
          new PublicKey(DRIFT_PROGRAM_ID)
        )[0];

        const driftUserPubkey = new PublicKey(params.driftUserPda);
        const driftUserStatsPubkey = new PublicKey(params.driftUserStatsPda);
        const perpMarketPubkey = new PublicKey(params.perpMarketPda);
        const oraclePubkey = new PublicKey(params.oraclePda);
        const magicContextPubkey = new PublicKey(MAGIC_CONTEXT_ID);
        const magicProgramPubkey = new PublicKey(MAGIC_PROGRAM_ID);

        const discriminator = await anchorDiscriminator("execute_trigger");

        const redelegateAfterExecution = params.redelegateAfterExecution ?? false;
        const argsData = Buffer.alloc(1);
        argsData.writeUInt8(redelegateAfterExecution ? 1 : 0, 0);
        const instructionData = Buffer.concat([discriminator, argsData]);

        const keys = [
          { pubkey: ownerPubkey, isSigner: true, isWritable: true },
          { pubkey: ghostOrderPda, isSigner: false, isWritable: true },
          { pubkey: driftStatePda, isSigner: false, isWritable: false },
          { pubkey: driftUserPubkey, isSigner: false, isWritable: true },
          { pubkey: driftUserStatsPubkey, isSigner: false, isWritable: true },
          { pubkey: ownerPubkey, isSigner: false, isWritable: false },
          { pubkey: perpMarketPubkey, isSigner: false, isWritable: true },
          { pubkey: oraclePubkey, isSigner: false, isWritable: false },
          { pubkey: magicContextPubkey, isSigner: false, isWritable: false },
          { pubkey: magicProgramPubkey, isSigner: false, isWritable: false },
        ];

        if (redelegateAfterExecution && params.delegationBuffer && params.delegationRecord && params.delegationMetadata) {
          keys.push(
            { pubkey: new PublicKey(params.delegationBuffer), isSigner: false, isWritable: true },
            { pubkey: new PublicKey(params.delegationRecord), isSigner: false, isWritable: true },
            { pubkey: new PublicKey(params.delegationMetadata), isSigner: false, isWritable: true }
          );
        }

        const executeTriggerIx = new TransactionInstruction({
          keys,
          programId,
          data: instructionData,
        });

        const tx = new Transaction().add(executeTriggerIx);

        const erConn = new Connection(MAGICBLOCK_ER_RPC, {
          commitment: "confirmed",
          wsEndpoint: MAGICBLOCK_ER_RPC.replace("https://", "wss://"),
        });

        const { blockhash } = await erConn.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;
        tx.feePayer = sessionKeypair.publicKey;
        tx.sign(sessionKeypair);

        const signature = await erConn.sendRawTransaction(tx.serialize(), {
          skipPreflight: true,
          preflightCommitment: "confirmed",
        });

        await erConn.confirmTransaction(signature, "confirmed");

        await new Promise((resolve) => setTimeout(resolve, STATE_PROPAGATION_DELAY_MS));

        await fetchGhostOrders();
        return { success: true, signature };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to execute trigger";
        return { success: false, error: message };
      }
    },
    [fetchGhostOrders]
  );

  return {
    isSessionActive,
    sessionExpiry,
    sessionPublicKey,
    status,
    error,

    createSession,
    endSession,

    isPrivacyModeEnabled,
    enablePrivacyMode,
    disablePrivacyMode,

    delegationStatus,
    delegatedAccount,
    delegateVaultToER,
    commitAndUndelegate,

    sessionBalance,
    fundSession,
    getSessionBalance,

    ghostOrders,
    isLoadingOrders,
    createGhostOrder,
    cancelGhostOrder,
    activateAndMonitor,
    executeTrigger,
    fetchGhostOrders,

    erConnection,
    baseConnection,
  };
}
