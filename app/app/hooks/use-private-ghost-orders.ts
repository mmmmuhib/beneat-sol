"use client";

import { useState, useCallback, useEffect } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import {
  deriveExecutorAuthorityPda,
  deriveEncryptedOrderPda,
  buildInitExecutorInstruction,
  buildDelegateExecutorInstruction,
  buildCreateEncryptedOrderInstruction,
  buildDelegateEncryptedOrderInstruction,
  buildCancelEncryptedOrderInstruction,
  buildCloseEncryptedOrderInstruction,
  buildUndelegateExecutorInstruction,
  parseExecutorAuthorityAccount,
  parseEncryptedOrderAccount,
  type CreateEncryptedOrderArgs,
  type DelegateEncryptedOrderAccounts,
  type ExecutorAuthorityState,
  type EncryptedOrderState,
  EncryptedOrderStatus,
  GHOST_BRIDGE_PROGRAM_ID,
} from "../lib/ghost-bridge-instructions";
import {
  encryptOrderForTEE,
  type CompressedGhostOrderData,
} from "../lib/tee-encryption";

export interface PrivateGhostOrder {
  orderId: string;
  orderHash: string;
  orderHashBytes: Uint8Array;
  marketIndex: number;
  triggerPrice: string;
  triggerCondition: "above" | "below";
  orderSide: "long" | "short";
  baseAssetAmount: string;
  reduceOnly: boolean;
  expiry: number;
  createdAt: number;
  status: "pending" | "active" | "delegated" | "executed" | "cancelled";
  feedId: string;
}

export interface CreatePrivateOrderParams {
  marketIndex: number;
  triggerPrice: string;
  triggerCondition: "above" | "below";
  orderSide: "long" | "short";
  baseAssetAmount: string;
  reduceOnly: boolean;
  expirySeconds: number;
  feedId: string;
}

export interface UsePrivateGhostOrdersReturn {
  executorState: ExecutorAuthorityState | null;
  orders: PrivateGhostOrder[];
  isLoading: boolean;
  isInitialized: boolean;
  isDelegated: boolean;
  error: string | null;
  initializeExecutor: () => Promise<string | null>;
  delegateExecutor: () => Promise<string | null>;
  undelegateExecutor: () => Promise<string | null>;
  createPrivateOrder: (params: CreatePrivateOrderParams) => Promise<string | null>;
  delegateEncryptedOrder: (orderHash: string) => Promise<string | null>;
  cancelPrivateOrder: (orderHash: string) => Promise<string | null>;
  closePrivateOrder: (orderHash: string) => Promise<string | null>;
  refreshExecutorState: () => Promise<void>;
  refreshOrderState: (orderHash: string) => Promise<EncryptedOrderState | null>;
}

const TEE_PUBLIC_KEY = process.env.NEXT_PUBLIC_TEE_PUBLIC_KEY || "";

export function usePrivateGhostOrders(): UsePrivateGhostOrdersReturn {
  const { publicKey, signTransaction, connected } = useWallet();
  const { connection } = useConnection();

  const [executorState, setExecutorState] = useState<ExecutorAuthorityState | null>(null);
  const [orders, setOrders] = useState<PrivateGhostOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isInitialized = executorState !== null;
  const isDelegated = executorState?.isDelegated ?? false;

  const refreshExecutorState = useCallback(async () => {
    if (!publicKey || !connection) return;

    try {
      const [executorPda] = deriveExecutorAuthorityPda(publicKey);
      const accountInfo = await connection.getAccountInfo(executorPda);

      if (accountInfo) {
        const state = parseExecutorAuthorityAccount(accountInfo.data);
        setExecutorState(state);
      } else {
        setExecutorState(null);
      }
    } catch (err) {
      console.error("Failed to fetch executor state:", err);
    }
  }, [publicKey, connection]);

  const refreshOrderState = useCallback(
    async (orderHash: string): Promise<EncryptedOrderState | null> => {
      if (!publicKey || !connection) return null;

      try {
        const orderHashBytes = Buffer.from(orderHash, "hex");
        const [orderPda] = deriveEncryptedOrderPda(publicKey, orderHashBytes);
        const accountInfo = await connection.getAccountInfo(orderPda);

        if (accountInfo) {
          return parseEncryptedOrderAccount(accountInfo.data);
        }
        return null;
      } catch (err) {
        console.error("Failed to fetch order state:", err);
        return null;
      }
    },
    [publicKey, connection]
  );

  useEffect(() => {
    if (connected && publicKey) {
      refreshExecutorState();
    } else {
      setExecutorState(null);
      setOrders([]);
    }
  }, [connected, publicKey, refreshExecutorState]);

  const initializeExecutor = useCallback(async (): Promise<string | null> => {
    if (!publicKey || !signTransaction || !connection) {
      setError("Wallet not connected");
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const instruction = await buildInitExecutorInstruction(publicKey);
      const transaction = new Transaction().add(instruction);

      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const signed = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(signature, "confirmed");

      await refreshExecutorState();

      return signature;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to initialize executor";
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signTransaction, connection, refreshExecutorState]);

  const delegateExecutor = useCallback(async (): Promise<string | null> => {
    if (!publicKey || !signTransaction || !connection) {
      setError("Wallet not connected");
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const {
        delegateBufferPdaFromDelegatedAccountAndOwnerProgram,
        delegationRecordPdaFromDelegatedAccount,
        delegationMetadataPdaFromDelegatedAccount,
      } = await import("@magicblock-labs/ephemeral-rollups-sdk");

      const [executorPda] = deriveExecutorAuthorityPda(publicKey);

      const delegationBuffer = delegateBufferPdaFromDelegatedAccountAndOwnerProgram(
        executorPda,
        GHOST_BRIDGE_PROGRAM_ID
      );
      const delegationRecord = delegationRecordPdaFromDelegatedAccount(executorPda);
      const delegationMetadata = delegationMetadataPdaFromDelegatedAccount(executorPda);

      const instruction = await buildDelegateExecutorInstruction(publicKey, {
        delegationBuffer,
        delegationRecord,
        delegationMetadata,
      });

      const transaction = new Transaction().add(instruction);

      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const signed = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(signature, "confirmed");

      await refreshExecutorState();

      return signature;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delegate executor";
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signTransaction, connection, refreshExecutorState]);

  const undelegateExecutor = useCallback(async (): Promise<string | null> => {
    if (!publicKey || !signTransaction || !connection) {
      setError("Wallet not connected");
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const instruction = await buildUndelegateExecutorInstruction(
        publicKey,
        publicKey
      );

      const transaction = new Transaction().add(instruction);

      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const signed = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(signature, "confirmed");

      await refreshExecutorState();

      return signature;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to undelegate executor";
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signTransaction, connection, refreshExecutorState]);

  const createPrivateOrder = useCallback(
    async (params: CreatePrivateOrderParams): Promise<string | null> => {
      if (!publicKey || !signTransaction || !connection) {
        setError("Wallet not connected");
        return null;
      }

      if (!TEE_PUBLIC_KEY) {
        setError("TEE public key not configured");
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const orderId = Date.now().toString();

        const orderData: CompressedGhostOrderData = {
          owner: publicKey.toBase58(),
          orderId,
          marketIndex: params.marketIndex,
          triggerPrice: params.triggerPrice,
          triggerCondition: params.triggerCondition,
          orderSide: params.orderSide,
          baseAssetAmount: params.baseAssetAmount,
          reduceOnly: params.reduceOnly,
          expiry: params.expirySeconds > 0
            ? Math.floor(Date.now() / 1000) + params.expirySeconds
            : 0,
          feedId: params.feedId,
        };

        const encryptedPayload = await encryptOrderForTEE(orderData, TEE_PUBLIC_KEY);

        const orderHashBytes = Buffer.from(encryptedPayload.orderHash, "hex");
        const encryptedDataBytes = Buffer.from(encryptedPayload.encryptedData, "base64");
        const feedIdBytes = new Uint8Array(32);
        const feedIdBuffer = Buffer.from(params.feedId.replace("0x", ""), "hex");
        feedIdBytes.set(feedIdBuffer.slice(0, 32));

        const createArgs: CreateEncryptedOrderArgs = {
          orderHash: orderHashBytes,
          encryptedData: encryptedDataBytes,
          feedId: feedIdBytes,
        };

        const instruction = await buildCreateEncryptedOrderInstruction(
          publicKey,
          createArgs
        );

        const transaction = new Transaction().add(instruction);

        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = publicKey;

        const signed = await signTransaction(transaction);
        const signature = await connection.sendRawTransaction(signed.serialize());
        await connection.confirmTransaction(signature, "confirmed");

        const newOrder: PrivateGhostOrder = {
          orderId,
          orderHash: encryptedPayload.orderHash,
          orderHashBytes,
          marketIndex: params.marketIndex,
          triggerPrice: params.triggerPrice,
          triggerCondition: params.triggerCondition,
          orderSide: params.orderSide,
          baseAssetAmount: params.baseAssetAmount,
          reduceOnly: params.reduceOnly,
          expiry: orderData.expiry,
          createdAt: Date.now(),
          status: "active",
          feedId: params.feedId,
        };

        setOrders((prev) => [...prev, newOrder]);
        await refreshExecutorState();

        return signature;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create private order";
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [publicKey, signTransaction, connection, refreshExecutorState]
  );

  const delegateEncryptedOrder = useCallback(
    async (orderHash: string): Promise<string | null> => {
      if (!publicKey || !signTransaction || !connection) {
        setError("Wallet not connected");
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const {
          delegateBufferPdaFromDelegatedAccountAndOwnerProgram,
          delegationRecordPdaFromDelegatedAccount,
          delegationMetadataPdaFromDelegatedAccount,
        } = await import("@magicblock-labs/ephemeral-rollups-sdk");

        const orderHashBytes = Buffer.from(orderHash, "hex");
        const [encryptedOrderPda] = deriveEncryptedOrderPda(publicKey, orderHashBytes);

        const delegationBuffer = delegateBufferPdaFromDelegatedAccountAndOwnerProgram(
          encryptedOrderPda,
          GHOST_BRIDGE_PROGRAM_ID
        );
        const delegationRecord = delegationRecordPdaFromDelegatedAccount(encryptedOrderPda);
        const delegationMetadata = delegationMetadataPdaFromDelegatedAccount(encryptedOrderPda);

        const delegationAccounts: DelegateEncryptedOrderAccounts = {
          delegationBuffer,
          delegationRecord,
          delegationMetadata,
        };

        const instruction = await buildDelegateEncryptedOrderInstruction(
          publicKey,
          orderHashBytes,
          delegationAccounts
        );

        const transaction = new Transaction().add(instruction);

        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = publicKey;

        const signed = await signTransaction(transaction);
        const signature = await connection.sendRawTransaction(signed.serialize());
        await connection.confirmTransaction(signature, "confirmed");

        setOrders((prev) =>
          prev.map((order) =>
            order.orderHash === orderHash
              ? { ...order, status: "delegated" as const }
              : order
          )
        );

        await refreshExecutorState();

        return signature;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to delegate order";
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [publicKey, signTransaction, connection, refreshExecutorState]
  );

  const cancelPrivateOrder = useCallback(
    async (orderHash: string): Promise<string | null> => {
      if (!publicKey || !signTransaction || !connection) {
        setError("Wallet not connected");
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const orderHashBytes = Buffer.from(orderHash, "hex");

        const instruction = await buildCancelEncryptedOrderInstruction(
          publicKey,
          orderHashBytes
        );

        const transaction = new Transaction().add(instruction);

        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = publicKey;

        const signed = await signTransaction(transaction);
        const signature = await connection.sendRawTransaction(signed.serialize());
        await connection.confirmTransaction(signature, "confirmed");

        setOrders((prev) =>
          prev.map((order) =>
            order.orderHash === orderHash
              ? { ...order, status: "cancelled" as const }
              : order
          )
        );

        await refreshExecutorState();

        return signature;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to cancel order";
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [publicKey, signTransaction, connection, refreshExecutorState]
  );

  const closePrivateOrder = useCallback(
    async (orderHash: string): Promise<string | null> => {
      if (!publicKey || !signTransaction || !connection) {
        setError("Wallet not connected");
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const orderHashBytes = Buffer.from(orderHash, "hex");

        const instruction = await buildCloseEncryptedOrderInstruction(
          publicKey,
          orderHashBytes
        );

        const transaction = new Transaction().add(instruction);

        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = publicKey;

        const signed = await signTransaction(transaction);
        const signature = await connection.sendRawTransaction(signed.serialize());
        await connection.confirmTransaction(signature, "confirmed");

        setOrders((prev) => prev.filter((order) => order.orderHash !== orderHash));

        return signature;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to close order";
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [publicKey, signTransaction, connection]
  );

  return {
    executorState,
    orders,
    isLoading,
    isInitialized,
    isDelegated,
    error,
    initializeExecutor,
    delegateExecutor,
    undelegateExecutor,
    createPrivateOrder,
    delegateEncryptedOrder,
    cancelPrivateOrder,
    closePrivateOrder,
    refreshExecutorState,
    refreshOrderState,
  };
}
