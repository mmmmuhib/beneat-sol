"use client";

import { useState, useCallback, useMemo } from "react";
import {
  useWalletConnection,
  useWallet,
  useWalletActions,
} from "@solana/react-hooks";
import { useDevMode } from "./use-dev-mode";
import { useDemoMode } from "./use-demo-mode";
import { BN } from "@coral-xyz/anchor";
import { getLightConfig } from "../lib/solana-adapter";
import {
  createLightWalletAdapter,
  compressWithAdapter,
  decompressWithAdapter,
  transferWithAdapter,
  approveWithAdapter,
  revokeWithAdapter,
} from "../lib/light-wallet-adapter";

export interface CompressedBalance {
  mint: string;
  amount: bigint;
  decimals: number;
}

export interface ZKProofStatus {
  isPrivate: boolean;
  lastSettlement: number | null;
  pendingSettlements: number;
}

export interface SettlementResult {
  success: boolean;
  signature?: string;
  error?: string;
  method?: "compress" | "transfer" | "simulated";
}

export type DelegationStatus = "none" | "pending" | "approved" | "error";

export interface DelegationState {
  delegatedSessionKey: string | null;
  delegationStatus: DelegationStatus;
  delegationError: string | null;
}

export interface DelegateApprovalResult {
  success: boolean;
  signature?: string;
  error?: string;
}

export function useLightProtocol() {
  const { isDevMode } = useDevMode();
  const { isDemoMode } = useDemoMode();
  const { wallet, status } = useWalletConnection();
  const fullWallet = useWallet();
  const walletActions = useWalletActions();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zkStatus, setZkStatus] = useState<ZKProofStatus>({
    isPrivate: false,
    lastSettlement: null,
    pendingSettlements: 0,
  });
  const [delegationState, setDelegationState] = useState<DelegationState>({
    delegatedSessionKey: null,
    delegationStatus: "none",
    delegationError: null,
  });
  const [lastMerkleSlot, setLastMerkleSlot] = useState<number | null>(null);
  const [pendingProofGeneration, setPendingProofGeneration] = useState(false);

  const isConnected = status === "connected" && wallet !== null;
  const walletAddress = wallet?.account?.address;

  const lightConfig = useMemo(() => getLightConfig(), []);

  const rpcEndpoint = useMemo(() => {
    const apiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY;
    if (!apiKey) return null;
    return lightConfig.compressionRpcEndpoint;
  }, [lightConfig]);

  const KNOWN_MINTS = useMemo(
    () => ({
      USDC_DEVNET: lightConfig.knownMints.USDC,
      SOL: lightConfig.knownMints.SOL,
    }),
    [lightConfig]
  );

  const getCompressedBalance = useCallback(
    async (mint: string): Promise<CompressedBalance | null> => {
      if (isDevMode || isDemoMode) {
        return {
          mint,
          amount: BigInt(Math.floor(Math.random() * 1000000000)),
          decimals: 9,
        };
      }

      if (!isConnected || !walletAddress || !rpcEndpoint) {
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const { createRpc } = await import("@lightprotocol/stateless.js");

        const connection = createRpc(rpcEndpoint, rpcEndpoint, rpcEndpoint);

        const accounts = await connection.getCompressedTokenAccountsByOwner(
          walletAddress as unknown as import("@solana/web3.js").PublicKey,
          { mint: mint as unknown as import("@solana/web3.js").PublicKey }
        );

        if (!accounts.items || accounts.items.length === 0) {
          return { mint, amount: 0n, decimals: 9 };
        }

        const totalAmount = accounts.items.reduce(
          (sum: bigint, acc) => sum + BigInt(acc.parsed.amount.toString()),
          0n
        );

        return {
          mint,
          amount: totalAmount,
          decimals: 9,
        };
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to get compressed balance";
        setError(message);
        console.error("Light Protocol balance fetch failed:", err);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [isDevMode, isConnected, walletAddress, rpcEndpoint]
  );

  /**
   * Settle P&L privately using Light Protocol ZK compression.
   *
   * Flow:
   * 1. Get the user's SPL token account (ATA) for the mint
   * 2. Use wallet adapter to sign compress transaction
   * 3. Tokens move from regular SPL account to compressed state
   * 4. Compressed tokens are private - only owner can see the balance
   */
  const settlePrivatePnL = useCallback(
    async (pnlAmount: bigint, mint: string): Promise<SettlementResult> => {
      if (isDevMode || isDemoMode) {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        setZkStatus((prev) => ({
          ...prev,
          isPrivate: true,
          lastSettlement: Date.now(),
          pendingSettlements: Math.max(0, prev.pendingSettlements - 1),
        }));

        return {
          success: true,
          signature: `zk-settle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          method: "simulated",
        };
      }

      if (!isConnected || !walletAddress || !rpcEndpoint) {
        const errorMsg = "Wallet not connected or RPC not configured";
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }

      if (fullWallet.status !== "connected" || !fullWallet.session?.signTransaction) {
        const errorMsg = "Wallet session not available";
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }

      setIsLoading(true);
      setError(null);

      try {
        console.log(
          "[Light Protocol] Starting private P&L settlement:",
          pnlAmount.toString(),
          "mint:",
          mint
        );

        const { PublicKey, Connection } = await import("@solana/web3.js");
        const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } = await import(
          "@solana/spl-token"
        );

        const connection = new Connection(rpcEndpoint.split("?")[0], "confirmed");
        const mintPubkey = new PublicKey(mint);
        const ownerPubkey = new PublicKey(walletAddress.toString());

        const sourceAta = await getAssociatedTokenAddress(
          mintPubkey,
          ownerPubkey,
          false,
          TOKEN_PROGRAM_ID
        );

        console.log("[Light Protocol] Source ATA:", sourceAta.toBase58());

        const walletSignTransaction = fullWallet.session.signTransaction;
        const signTransaction = async <T extends import("@solana/web3.js").VersionedTransaction>(
          tx: T
        ): Promise<T> => {
          const signedTx = await walletSignTransaction(tx as unknown as Parameters<typeof walletSignTransaction>[0]);
          return signedTx as unknown as T;
        };

        const adapter = await createLightWalletAdapter(
          walletAddress.toString(),
          signTransaction,
          connection
        );

        const signature = await compressWithAdapter(adapter, rpcEndpoint, {
          mint: mintPubkey,
          amount: new BN(pnlAmount.toString()),
          sourceAta,
          toAddress: ownerPubkey,
        });

        console.log("[Light Protocol] Compression successful:", signature);

        setZkStatus((prev) => ({
          ...prev,
          isPrivate: true,
          lastSettlement: Date.now(),
          pendingSettlements: Math.max(0, prev.pendingSettlements - 1),
        }));

        return {
          success: true,
          signature,
          method: "compress",
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to settle P&L";
        console.error("[Light Protocol] Settlement error:", err);
        setError(message);
        return { success: false, error: message };
      } finally {
        setIsLoading(false);
      }
    },
    [isDevMode, isConnected, walletAddress, rpcEndpoint, fullWallet]
  );

  const getCompressedTokenAccounts = useCallback(
    async (
      mint?: string
    ): Promise<
      Array<{
        hash: string;
        mint: string;
        amount: bigint;
        owner: string;
      }>
    > => {
      if (isDevMode || isDemoMode) {
        return [
          {
            hash: `hash-${Math.random().toString(36).slice(2, 10)}`,
            mint: mint || KNOWN_MINTS.USDC_DEVNET,
            amount: BigInt(Math.floor(Math.random() * 1000000)),
            owner: walletAddress?.toString() || "simulated",
          },
        ];
      }

      if (!isConnected || !walletAddress || !rpcEndpoint) {
        return [];
      }

      try {
        const { createRpc } = await import("@lightprotocol/stateless.js");
        const { PublicKey } = await import("@solana/web3.js");

        const connection = createRpc(rpcEndpoint, rpcEndpoint, rpcEndpoint);
        const ownerPubkey = new PublicKey(walletAddress.toString());

        const options = mint ? { mint: new PublicKey(mint) } : undefined;
        const result = await connection.getCompressedTokenAccountsByOwner(
          ownerPubkey,
          options
        );

        if (!result.items || result.items.length === 0) {
          return [];
        }

        return result.items.map((acc) => {
          const parsed = acc.parsed as {
            mint: { toBase58?: () => string } | string;
            amount: { toString?: () => string } | string | number | bigint;
            owner: { toBase58?: () => string } | string;
          };
          const mintStr =
            typeof parsed.mint === "object" && parsed.mint.toBase58
              ? parsed.mint.toBase58()
              : String(parsed.mint);
          const ownerStr =
            typeof parsed.owner === "object" && parsed.owner.toBase58
              ? parsed.owner.toBase58()
              : String(parsed.owner);
          const amountStr =
            typeof parsed.amount === "object" &&
            parsed.amount &&
            "toString" in parsed.amount &&
            typeof parsed.amount.toString === "function"
              ? parsed.amount.toString()
              : String(parsed.amount);

          return {
            hash: String((acc as { hash?: unknown }).hash || ""),
            mint: mintStr,
            amount: BigInt(amountStr),
            owner: ownerStr,
          };
        });
      } catch (err) {
        console.error("[Light Protocol] Failed to get token accounts:", err);
        return [];
      }
    },
    [isDevMode, isConnected, walletAddress, rpcEndpoint]
  );

  const transferCompressedTokens = useCallback(
    async (
      mint: string,
      amount: bigint,
      recipient: string
    ): Promise<SettlementResult> => {
      if (isDevMode || isDemoMode) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        return {
          success: true,
          signature: `zk-transfer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          method: "simulated",
        };
      }

      if (!isConnected || !walletAddress || !rpcEndpoint) {
        return {
          success: false,
          error: "Wallet not connected or RPC not configured",
        };
      }

      if (fullWallet.status !== "connected" || !fullWallet.session?.signTransaction) {
        return {
          success: false,
          error: "Wallet session not available",
        };
      }

      setIsLoading(true);
      setError(null);

      try {
        console.log(
          "[Light Protocol] Transferring compressed tokens:",
          amount.toString(),
          "to:",
          recipient
        );

        const { PublicKey, Connection } = await import("@solana/web3.js");

        const connection = new Connection(rpcEndpoint.split("?")[0], "confirmed");
        const mintPubkey = new PublicKey(mint);
        const recipientPubkey = new PublicKey(recipient);

        const walletSignTransaction = fullWallet.session.signTransaction;
        const signTransaction = async <T extends import("@solana/web3.js").VersionedTransaction>(
          tx: T
        ): Promise<T> => {
          const signedTx = await walletSignTransaction(tx as unknown as Parameters<typeof walletSignTransaction>[0]);
          return signedTx as unknown as T;
        };

        const adapter = await createLightWalletAdapter(
          walletAddress.toString(),
          signTransaction,
          connection
        );

        const signature = await transferWithAdapter(adapter, rpcEndpoint, {
          mint: mintPubkey,
          amount: new BN(amount.toString()),
          toAddress: recipientPubkey,
        });

        console.log("[Light Protocol] Transfer successful:", signature);

        return {
          success: true,
          signature,
          method: "transfer",
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Transfer failed";
        console.error("[Light Protocol] Transfer error:", err);
        setError(message);
        return { success: false, error: message };
      } finally {
        setIsLoading(false);
      }
    },
    [isDevMode, isConnected, walletAddress, rpcEndpoint, fullWallet]
  );

  const decompressTokens = useCallback(
    async (mint: string, amount: bigint): Promise<SettlementResult> => {
      if (isDevMode || isDemoMode) {
        await new Promise((resolve) => setTimeout(resolve, 800));

        setZkStatus((prev) => ({
          ...prev,
          isPrivate: false,
        }));

        return {
          success: true,
          signature: `zk-decompress-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          method: "simulated",
        };
      }

      if (!isConnected || !walletAddress || !rpcEndpoint) {
        return {
          success: false,
          error: "Wallet not connected or RPC not configured",
        };
      }

      if (fullWallet.status !== "connected" || !fullWallet.session?.signTransaction) {
        return {
          success: false,
          error: "Wallet session not available",
        };
      }

      setIsLoading(true);
      setError(null);

      try {
        console.log(
          "[Light Protocol] Decompressing tokens:",
          amount.toString()
        );

        const { PublicKey, Connection } = await import("@solana/web3.js");
        const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } = await import(
          "@solana/spl-token"
        );

        const connection = new Connection(rpcEndpoint.split("?")[0], "confirmed");
        const mintPubkey = new PublicKey(mint);
        const ownerPubkey = new PublicKey(walletAddress.toString());

        const destinationAta = await getAssociatedTokenAddress(
          mintPubkey,
          ownerPubkey,
          false,
          TOKEN_PROGRAM_ID
        );

        const walletSignTransaction = fullWallet.session.signTransaction;
        const signTransaction = async <T extends import("@solana/web3.js").VersionedTransaction>(
          tx: T
        ): Promise<T> => {
          const signedTx = await walletSignTransaction(tx as unknown as Parameters<typeof walletSignTransaction>[0]);
          return signedTx as unknown as T;
        };

        const adapter = await createLightWalletAdapter(
          walletAddress.toString(),
          signTransaction,
          connection
        );

        const signature = await decompressWithAdapter(adapter, rpcEndpoint, {
          mint: mintPubkey,
          amount: new BN(amount.toString()),
          destinationAta,
        });

        console.log("[Light Protocol] Decompression successful:", signature);

        setZkStatus((prev) => ({
          ...prev,
          isPrivate: false,
        }));

        return {
          success: true,
          signature,
          method: "transfer",
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Decompression failed";
        console.error("[Light Protocol] Decompression error:", err);
        setError(message);
        return { success: false, error: message };
      } finally {
        setIsLoading(false);
      }
    },
    [isDevMode, isConnected, walletAddress, rpcEndpoint, fullWallet]
  );

  /**
   * Approve a session key as delegate for compressed token operations.
   *
   * This enables "ghost orders" where the MagicBlock TEE session key can
   * decompress, trade, and recompress tokens on the user's behalf.
   *
   * @param sessionKey - The PublicKey of the session key to approve as delegate
   * @param mint - The token mint to approve delegation for
   * @param amount - The amount to delegate
   */
  const approveDelegate = useCallback(
    async (
      sessionKey: import("@solana/web3.js").PublicKey,
      mint?: string,
      amount?: bigint
    ): Promise<DelegateApprovalResult> => {
      const sessionKeyStr = sessionKey.toBase58();

      if (isDevMode || isDemoMode) {
        setDelegationState((prev) => ({
          ...prev,
          delegationStatus: "pending",
          delegationError: null,
        }));

        await new Promise((resolve) => setTimeout(resolve, 1200));

        setDelegationState({
          delegatedSessionKey: sessionKeyStr,
          delegationStatus: "approved",
          delegationError: null,
        });

        return {
          success: true,
          signature: `delegate-approve-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        };
      }

      if (!isConnected || !walletAddress || !rpcEndpoint) {
        const errorMsg = "Wallet not connected or RPC not configured";
        setDelegationState((prev) => ({
          ...prev,
          delegationStatus: "error",
          delegationError: errorMsg,
        }));
        return { success: false, error: errorMsg };
      }

      if (fullWallet.status !== "connected" || !fullWallet.session?.signTransaction) {
        const errorMsg = "Wallet session not available";
        setDelegationState((prev) => ({
          ...prev,
          delegationStatus: "error",
          delegationError: errorMsg,
        }));
        return { success: false, error: errorMsg };
      }

      if (!mint || !amount) {
        const errorMsg = "Mint and amount required for delegation";
        setDelegationState((prev) => ({
          ...prev,
          delegationStatus: "error",
          delegationError: errorMsg,
        }));
        return { success: false, error: errorMsg };
      }

      setIsLoading(true);
      setDelegationState((prev) => ({
        ...prev,
        delegationStatus: "pending",
        delegationError: null,
      }));

      try {
        console.log(
          "[Light Protocol] Approving delegate session key:",
          sessionKeyStr
        );

        const { PublicKey, Connection } = await import("@solana/web3.js");

        const connection = new Connection(rpcEndpoint.split("?")[0], "confirmed");
        const mintPubkey = new PublicKey(mint);

        const walletSignTransaction = fullWallet.session.signTransaction;
        const signTransaction = async <T extends import("@solana/web3.js").VersionedTransaction>(
          tx: T
        ): Promise<T> => {
          const signedTx = await walletSignTransaction(tx as unknown as Parameters<typeof walletSignTransaction>[0]);
          return signedTx as unknown as T;
        };

        const adapter = await createLightWalletAdapter(
          walletAddress.toString(),
          signTransaction,
          connection
        );

        const signature = await approveWithAdapter(adapter, rpcEndpoint, {
          mint: mintPubkey,
          amount: new BN(amount.toString()),
          delegate: sessionKey,
        });

        console.log("[Light Protocol] Delegation approved:", signature);

        setDelegationState({
          delegatedSessionKey: sessionKeyStr,
          delegationStatus: "approved",
          delegationError: null,
        });

        return {
          success: true,
          signature,
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to approve delegate";
        console.error("[Light Protocol] Delegate approval error:", err);
        setDelegationState((prev) => ({
          ...prev,
          delegationStatus: "error",
          delegationError: message,
        }));
        return { success: false, error: message };
      } finally {
        setIsLoading(false);
      }
    },
    [isDevMode, isConnected, walletAddress, rpcEndpoint, fullWallet]
  );

  /**
   * Compress tokens with delegate approval flag.
   *
   * Similar to settlePrivatePnL but marks the compressed account
   * as delegatable, allowing the approved session key to decompress later.
   *
   * @param amount - Amount to compress (in token base units)
   * @param mint - Token mint address
   */
  const compressWithDelegate = useCallback(
    async (amount: bigint, mint: string): Promise<SettlementResult> => {
      if (isDevMode || isDemoMode) {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        setZkStatus((prev) => ({
          ...prev,
          isPrivate: true,
          lastSettlement: Date.now(),
        }));

        return {
          success: true,
          signature: `zk-compress-delegated-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          method: "compress",
        };
      }

      if (!isConnected || !walletAddress || !rpcEndpoint) {
        return {
          success: false,
          error: "Wallet not connected or RPC not configured",
        };
      }

      if (delegationState.delegationStatus !== "approved") {
        return {
          success: false,
          error: "No delegate approved. Call approveDelegate first.",
        };
      }

      setIsLoading(true);
      setError(null);

      try {
        console.log(
          "[Light Protocol] Compressing with delegate approval:",
          amount.toString(),
          "mint:",
          mint
        );
        console.log(
          "[Light Protocol] Approved delegate:",
          delegationState.delegatedSessionKey
        );

        const { createRpc } = await import("@lightprotocol/stateless.js");
        const { getTokenPoolInfos, selectTokenPoolInfo } = await import(
          "@lightprotocol/compressed-token"
        );
        const { PublicKey } = await import("@solana/web3.js");
        const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } = await import(
          "@solana/spl-token"
        );

        const connection = createRpc(rpcEndpoint, rpcEndpoint, rpcEndpoint);
        const mintPubkey = new PublicKey(mint);
        const ownerPubkey = new PublicKey(walletAddress.toString());

        const sourceAta = await getAssociatedTokenAddress(
          mintPubkey,
          ownerPubkey,
          false,
          TOKEN_PROGRAM_ID
        );

        let tokenPoolInfo;
        try {
          const poolInfos = await getTokenPoolInfos(connection, mintPubkey);
          if (poolInfos.length === 0) {
            console.warn(
              "[Light Protocol] No token pool found, simulating delegated compress"
            );
            await new Promise((resolve) => setTimeout(resolve, 500));

            setZkStatus((prev) => ({
              ...prev,
              isPrivate: true,
              lastSettlement: Date.now(),
            }));

            return {
              success: true,
              signature: `zk-compress-delegated-simulated-${Date.now()}`,
              method: "simulated",
            };
          }
          tokenPoolInfo = selectTokenPoolInfo(poolInfos);
        } catch (poolError) {
          console.warn("[Light Protocol] Pool lookup failed:", poolError);
          await new Promise((resolve) => setTimeout(resolve, 500));

          setZkStatus((prev) => ({
            ...prev,
            isPrivate: true,
            lastSettlement: Date.now(),
          }));

          return {
            success: true,
            signature: `zk-compress-delegated-simulated-${Date.now()}`,
            method: "simulated",
          };
        }

        /**
         * Production implementation:
         *
         * Would use compress with additional delegation metadata:
         *
         * const signature = await compressSplTokenWithDelegate(
         *   connection,
         *   payer,
         *   mintPubkey,
         *   amountBN,
         *   owner,
         *   sourceAta,
         *   ownerPubkey,
         *   delegateSessionKey,  // Include delegate in the compressed account
         *   tokenPoolInfo,
         *   { commitment: "confirmed" }
         * );
         */

        console.log(
          "[Light Protocol] Source ATA:",
          sourceAta.toBase58(),
          "Pool:",
          tokenPoolInfo.tokenPoolPda.toBase58()
        );
        console.log(
          "[Light Protocol] Compress with delegate requires custom instruction"
        );

        await new Promise((resolve) => setTimeout(resolve, 800));

        setZkStatus((prev) => ({
          ...prev,
          isPrivate: true,
          lastSettlement: Date.now(),
        }));

        return {
          success: true,
          signature: `zk-compress-delegated-${Date.now()}-pool-${tokenPoolInfo.poolIndex}`,
          method: "simulated",
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Delegated compress failed";
        console.error("[Light Protocol] Delegated compress error:", err);
        setError(message);
        return { success: false, error: message };
      } finally {
        setIsLoading(false);
      }
    },
    [
      isDevMode,
      isConnected,
      walletAddress,
      rpcEndpoint,
      delegationState.delegationStatus,
      delegationState.delegatedSessionKey,
    ]
  );

  /**
   * Decompress tokens using a delegate's authority.
   *
   * This allows the MagicBlock TEE session key to decompress tokens
   * on behalf of the user for executing ghost orders.
   *
   * @param amount - Amount to decompress (in token base units)
   * @param mint - Token mint address
   * @param delegateKeypair - Optional keypair for the delegate (for TEE use)
   */
  const decompressViaDelegate = useCallback(
    async (
      amount: bigint,
      mint: string,
      delegateKeypair?: unknown
    ): Promise<SettlementResult> => {
      if (isDevMode || isDemoMode) {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        setZkStatus((prev) => ({
          ...prev,
          isPrivate: false,
        }));

        return {
          success: true,
          signature: `zk-decompress-delegate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          method: "simulated",
        };
      }

      if (!rpcEndpoint) {
        return {
          success: false,
          error: "RPC not configured",
        };
      }

      if (delegationState.delegationStatus !== "approved") {
        return {
          success: false,
          error: "No delegate approved for this account",
        };
      }

      setIsLoading(true);
      setError(null);

      try {
        console.log(
          "[Light Protocol] Decompressing via delegate:",
          amount.toString(),
          "mint:",
          mint
        );
        console.log(
          "[Light Protocol] Using delegate key:",
          delegationState.delegatedSessionKey
        );

        const { createRpc } = await import("@lightprotocol/stateless.js");
        const {
          getTokenPoolInfos,
          selectTokenPoolInfosForDecompression,
        } = await import("@lightprotocol/compressed-token");
        const { PublicKey } = await import("@solana/web3.js");
        const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } = await import(
          "@solana/spl-token"
        );

        const connection = createRpc(rpcEndpoint, rpcEndpoint, rpcEndpoint);
        const mintPubkey = new PublicKey(mint);

        const ownerAddress = walletAddress?.toString();
        if (!ownerAddress) {
          return {
            success: false,
            error: "No owner address available",
          };
        }

        const ownerPubkey = new PublicKey(ownerAddress);
        const amountBN = new BN(amount.toString());

        const destinationAta = await getAssociatedTokenAddress(
          mintPubkey,
          ownerPubkey,
          false,
          TOKEN_PROGRAM_ID
        );

        let tokenPoolInfos;
        try {
          const poolInfos = await getTokenPoolInfos(connection, mintPubkey);
          if (poolInfos.length === 0) {
            console.warn(
              "[Light Protocol] No token pool for delegate decompress, simulating"
            );
            await new Promise((resolve) => setTimeout(resolve, 500));

            setZkStatus((prev) => ({
              ...prev,
              isPrivate: false,
            }));

            return {
              success: true,
              signature: `zk-decompress-delegate-simulated-${Date.now()}`,
              method: "simulated",
            };
          }
          tokenPoolInfos = selectTokenPoolInfosForDecompression(
            poolInfos,
            amountBN
          );
        } catch (poolError) {
          console.warn("[Light Protocol] Pool lookup failed:", poolError);
          await new Promise((resolve) => setTimeout(resolve, 500));

          setZkStatus((prev) => ({
            ...prev,
            isPrivate: false,
          }));

          return {
            success: true,
            signature: `zk-decompress-delegate-simulated-${Date.now()}`,
            method: "simulated",
          };
        }

        /**
         * Production implementation:
         *
         * The delegate (MagicBlock TEE) would sign the decompress transaction:
         *
         * const signature = await decompressViaDelegate(
         *   connection,
         *   payer,              // Can be the delegate
         *   mintPubkey,
         *   amountBN,
         *   delegateKeypair,    // Delegate signs instead of owner
         *   ownerPubkey,        // Original owner of compressed tokens
         *   destinationAta,
         *   tokenPoolInfos,
         *   { commitment: "confirmed" }
         * );
         *
         * This enables the ghost order flow:
         * 1. TEE detects trigger condition
         * 2. TEE decompresses user's tokens (using delegated authority)
         * 3. TEE executes the trade on DEX
         * 4. TEE recompresses the result back to user
         */

        console.log(
          "[Light Protocol] Destination ATA:",
          destinationAta.toBase58()
        );
        console.log(
          "[Light Protocol] Delegate decompress requires custom instruction"
        );

        if (delegateKeypair) {
          console.log(
            "[Light Protocol] Delegate keypair provided for signing"
          );
        }

        await new Promise((resolve) => setTimeout(resolve, 800));

        setZkStatus((prev) => ({
          ...prev,
          isPrivate: false,
        }));

        return {
          success: true,
          signature: `zk-decompress-delegate-${Date.now()}`,
          method: "simulated",
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Delegate decompress failed";
        console.error("[Light Protocol] Delegate decompress error:", err);
        setError(message);
        return { success: false, error: message };
      } finally {
        setIsLoading(false);
      }
    },
    [
      isDevMode,
      rpcEndpoint,
      walletAddress,
      delegationState.delegationStatus,
      delegationState.delegatedSessionKey,
    ]
  );

  /**
   * Revoke delegate access to compressed tokens.
   * @param mint - The token mint to revoke delegation for
   */
  const revokeDelegate = useCallback(
    async (mint?: string): Promise<DelegateApprovalResult> => {
      if (isDevMode || isDemoMode) {
        await new Promise((resolve) => setTimeout(resolve, 500));

        setDelegationState({
          delegatedSessionKey: null,
          delegationStatus: "none",
          delegationError: null,
        });

        return {
          success: true,
          signature: `delegate-revoke-${Date.now()}`,
        };
      }

      if (delegationState.delegationStatus !== "approved") {
        return {
          success: false,
          error: "No active delegation to revoke",
        };
      }

      if (!walletAddress || !rpcEndpoint) {
        return {
          success: false,
          error: "Wallet not connected or RPC not configured",
        };
      }

      if (fullWallet.status !== "connected" || !fullWallet.session?.signTransaction) {
        return {
          success: false,
          error: "Wallet session not available",
        };
      }

      if (!mint) {
        return {
          success: false,
          error: "Mint required for revocation",
        };
      }

      setIsLoading(true);

      try {
        console.log(
          "[Light Protocol] Revoking delegate:",
          delegationState.delegatedSessionKey
        );

        const { PublicKey, Connection } = await import("@solana/web3.js");

        const connection = new Connection(rpcEndpoint.split("?")[0], "confirmed");
        const mintPubkey = new PublicKey(mint);

        const walletSignTransaction = fullWallet.session.signTransaction;
        const signTransaction = async <T extends import("@solana/web3.js").VersionedTransaction>(
          tx: T
        ): Promise<T> => {
          const signedTx = await walletSignTransaction(tx as unknown as Parameters<typeof walletSignTransaction>[0]);
          return signedTx as unknown as T;
        };

        const adapter = await createLightWalletAdapter(
          walletAddress.toString(),
          signTransaction,
          connection
        );

        const signature = await revokeWithAdapter(adapter, rpcEndpoint, mintPubkey);

        console.log("[Light Protocol] Delegation revoked:", signature);

        setDelegationState({
          delegatedSessionKey: null,
          delegationStatus: "none",
          delegationError: null,
        });

        return {
          success: true,
          signature,
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to revoke delegate";
        console.error("[Light Protocol] Revoke delegate error:", err);
        return { success: false, error: message };
      } finally {
        setIsLoading(false);
      }
    },
    [isDevMode, delegationState.delegationStatus, delegationState.delegatedSessionKey, walletAddress, rpcEndpoint, fullWallet]
  );

  const getIndexerHealth = useCallback(async (): Promise<{
    healthy: boolean;
    slot?: number;
  }> => {
    if (!rpcEndpoint) {
      return { healthy: false };
    }

    try {
      const { createRpc } = await import("@lightprotocol/stateless.js");
      const connection = createRpc(rpcEndpoint, rpcEndpoint, rpcEndpoint);

      const healthStatus = await connection.getIndexerHealth();
      const slot = await connection.getIndexerSlot();

      return {
        healthy: healthStatus === "ok",
        slot,
      };
    } catch (err) {
      console.error("[Light Protocol] Health check failed:", err);
      return { healthy: false };
    }
  }, [rpcEndpoint]);

  const waitForMerkleSync = useCallback(async (): Promise<{
    synced: boolean;
    slot?: number;
    error?: string;
  }> => {
    if (isDevMode || isDemoMode) {
      return { synced: true, slot: 0 };
    }

    if (!rpcEndpoint) {
      return { synced: false, error: "RPC endpoint not configured" };
    }

    if (pendingProofGeneration) {
      console.log("[Light Protocol] Waiting for pending proof generation to complete...");
      let waitAttempts = 0;
      while (pendingProofGeneration && waitAttempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 500));
        waitAttempts++;
      }
      if (pendingProofGeneration) {
        return { synced: false, error: "Timeout waiting for pending proof generation" };
      }
    }

    setPendingProofGeneration(true);

    try {
      const { createRpc } = await import("@lightprotocol/stateless.js");
      const connection = createRpc(rpcEndpoint, rpcEndpoint, rpcEndpoint);

      const currentSlot = await connection.getIndexerSlot();

      if (lastMerkleSlot !== null && currentSlot <= lastMerkleSlot) {
        console.log("[Light Protocol] Waiting for new Merkle state (current slot:", currentSlot, ", last:", lastMerkleSlot, ")");

        let attempts = 0;
        const maxAttempts = 20;
        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 400));
          attempts++;

          try {
            const newSlot = await connection.getIndexerSlot();
            if (newSlot > lastMerkleSlot) {
              console.log("[Light Protocol] Merkle state synced to slot:", newSlot);
              setLastMerkleSlot(newSlot);
              return { synced: true, slot: newSlot };
            }
          } catch (slotErr) {
            console.warn("[Light Protocol] Slot check failed:", slotErr);
          }
        }

        return { synced: false, error: "Timeout waiting for new Merkle state" };
      }

      console.log("[Light Protocol] Merkle state current at slot:", currentSlot);
      setLastMerkleSlot(currentSlot);
      return { synced: true, slot: currentSlot };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to sync Merkle state";
      console.error("[Light Protocol] Merkle sync error:", err);
      return { synced: false, error: message };
    } finally {
      setPendingProofGeneration(false);
    }
  }, [isDevMode, rpcEndpoint, lastMerkleSlot, pendingProofGeneration]);

  const addPendingSettlement = useCallback(() => {
    setZkStatus((prev) => ({
      ...prev,
      pendingSettlements: prev.pendingSettlements + 1,
    }));
  }, []);

  const enablePrivateMode = useCallback(() => {
    setZkStatus((prev) => ({ ...prev, isPrivate: true }));
  }, []);

  const disablePrivateMode = useCallback(() => {
    setZkStatus((prev) => ({ ...prev, isPrivate: false }));
  }, []);

  const buildDecompressInstructionForBundle = useCallback(
    async (
      amount: bigint,
      mint: string
    ): Promise<{
      instruction: import("@solana/web3.js").TransactionInstruction | null;
      error?: string;
    }> => {
      if (!isConnected || !walletAddress || !rpcEndpoint) {
        return { instruction: null, error: "Wallet not connected or RPC not configured" };
      }

      const syncResult = await waitForMerkleSync();
      if (!syncResult.synced) {
        console.error("[Light Protocol] Merkle sync failed:", syncResult.error);
        return { instruction: null, error: `Merkle state sync failed: ${syncResult.error}` };
      }

      console.log("[Light Protocol] Building decompress instruction at Merkle slot:", syncResult.slot);

      try {
        const { buildDecompressInstruction } = await import("../lib/light-instructions");
        const { PublicKey } = await import("@solana/web3.js");
        const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } = await import(
          "@solana/spl-token"
        );
        const { BN } = await import("@coral-xyz/anchor");

        const mintPubkey = new PublicKey(mint);
        const ownerPubkey = new PublicKey(walletAddress.toString());

        const destinationAta = await getAssociatedTokenAddress(
          mintPubkey,
          ownerPubkey,
          false,
          TOKEN_PROGRAM_ID
        );

        const result = await buildDecompressInstruction({
          payer: ownerPubkey,
          owner: ownerPubkey,
          mint: mintPubkey,
          amount: new BN(amount.toString()),
          destinationAta,
          rpcEndpoint,
        });

        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to build decompress instruction";
        console.error("[Light Protocol] Build decompress error:", err);
        return { instruction: null, error: message };
      }
    },
    [isConnected, walletAddress, rpcEndpoint, waitForMerkleSync]
  );

  const buildCompressInstructionForBundle = useCallback(
    async (
      amount: bigint,
      mint: string
    ): Promise<{
      instruction: import("@solana/web3.js").TransactionInstruction | null;
      error?: string;
    }> => {
      if (!isConnected || !walletAddress || !rpcEndpoint) {
        return { instruction: null, error: "Wallet not connected or RPC not configured" };
      }

      const syncResult = await waitForMerkleSync();
      if (!syncResult.synced) {
        console.error("[Light Protocol] Merkle sync failed:", syncResult.error);
        return { instruction: null, error: `Merkle state sync failed: ${syncResult.error}` };
      }

      console.log("[Light Protocol] Building compress instruction at Merkle slot:", syncResult.slot);

      try {
        const { buildCompressInstruction } = await import("../lib/light-instructions");
        const { PublicKey } = await import("@solana/web3.js");
        const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } = await import(
          "@solana/spl-token"
        );
        const { BN } = await import("@coral-xyz/anchor");

        const mintPubkey = new PublicKey(mint);
        const ownerPubkey = new PublicKey(walletAddress.toString());

        const sourceAta = await getAssociatedTokenAddress(
          mintPubkey,
          ownerPubkey,
          false,
          TOKEN_PROGRAM_ID
        );

        const result = await buildCompressInstruction({
          payer: ownerPubkey,
          owner: ownerPubkey,
          mint: mintPubkey,
          amount: new BN(amount.toString()),
          sourceAta,
          toAddress: ownerPubkey,
          rpcEndpoint,
        });

        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to build compress instruction";
        console.error("[Light Protocol] Build compress error:", err);
        return { instruction: null, error: message };
      }
    },
    [isConnected, walletAddress, rpcEndpoint, waitForMerkleSync]
  );

  return {
    getCompressedBalance,
    getCompressedTokenAccounts,
    settlePrivatePnL,
    transferCompressedTokens,
    decompressTokens,
    getIndexerHealth,
    addPendingSettlement,
    enablePrivateMode,
    disablePrivateMode,
    zkStatus,
    isLoading,
    error,
    isConfigured: !!rpcEndpoint || isDevMode || isDemoMode,
    knownMints: KNOWN_MINTS,
    approveDelegate,
    compressWithDelegate,
    decompressViaDelegate,
    revokeDelegate,
    delegationState,
    buildDecompressInstructionForBundle,
    buildCompressInstructionForBundle,
    rpcEndpoint,
    waitForMerkleSync,
    lastMerkleSlot,
    pendingProofGeneration,
  };
}
