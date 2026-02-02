"use client";

import { useState, useCallback, useMemo } from "react";
import { useWalletConnection, useWallet } from "@solana/react-hooks";
import { useDevMode } from "./use-dev-mode";
import { useDemoMode } from "./use-demo-mode";
import { useLightProtocol } from "./use-light-protocol";
import { useDrift } from "./use-drift";
import { toPublicKey, createConnection } from "../lib/solana-adapter";
import {
  submitAtomicBundleWithRetry,
  type BundleResult,
} from "../lib/jito-bundle";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_DECIMALS = 6;

export interface ShieldTradeParams {
  token: string;
  side: "long" | "short";
  collateralAmount: number;
  leverage: number;
  slippageBps?: number;
}

export interface ShieldCloseParams {
  positionId: string;
  token: string;
  side: "long" | "short";
  percentage?: number;
}

export interface ShieldResult {
  success: boolean;
  signature?: string;
  bundleId?: string;
  error?: string;
  phase?: "decompress" | "deposit" | "trade" | "withdraw" | "compress";
  timestamp: number;
  realizedLoss?: bigint;
  settledAmount?: bigint;
  pendingSettlement?: boolean;
  pendingSettlementAmount?: bigint;
}

export interface UseShieldReturn {
  isShielding: boolean;
  shieldError: string | null;
  lastShieldResult: ShieldResult | null;
  shieldMode: boolean;
  hasPendingSettlement: boolean;

  enableShieldMode: () => void;
  disableShieldMode: () => void;
  executeShieldedTrade: (params: ShieldTradeParams) => Promise<ShieldResult>;
  executeShieldedClose: (params: ShieldCloseParams) => Promise<ShieldResult>;
  prefundFromCompressed: (amount: number) => Promise<ShieldResult>;
  executeSimpleTrade: (params: ShieldTradeParams) => Promise<ShieldResult>;
  settlePending: () => Promise<ShieldResult>;

  canShield: boolean;
}

async function simulatePhase(phase: string, durationMs: number): Promise<void> {
  console.log(`[Shield] Starting phase: ${phase}`);
  await new Promise((resolve) => setTimeout(resolve, durationMs));
  console.log(`[Shield] Completed phase: ${phase}`);
}

export function useShield(): UseShieldReturn {
  const { isDevMode } = useDevMode();
  const { isDemoMode } = useDemoMode();
  const { wallet, status } = useWalletConnection();
  const walletStatus = useWallet();
  const lightProtocol = useLightProtocol();
  const drift = useDrift();

  const [isShielding, setIsShielding] = useState(false);
  const [shieldError, setShieldError] = useState<string | null>(null);
  const [lastShieldResult, setLastShieldResult] = useState<ShieldResult | null>(null);
  const [shieldMode, setShieldMode] = useState(false);
  const [pendingSettlementAmount, setPendingSettlementAmount] = useState<bigint | null>(null);

  const isConnected = status === "connected" && wallet !== null;
  const walletAddress = wallet?.account?.address;

  const canShield = useMemo(() => {
    if (!isConnected || !walletAddress) return false;
    if (!shieldMode) return false;
    if (isDevMode || isDemoMode) return true;
    return lightProtocol.zkStatus.isPrivate;
  }, [isConnected, walletAddress, shieldMode, isDevMode, lightProtocol.zkStatus.isPrivate]);

  const enableShieldMode = useCallback(() => {
    setShieldMode(true);
    console.log("[Shield] Shield mode enabled");
  }, []);

  const disableShieldMode = useCallback(() => {
    setShieldMode(false);
    console.log("[Shield] Shield mode disabled");
  }, []);

  const hasPendingSettlement = pendingSettlementAmount !== null && pendingSettlementAmount > BigInt(0);

  const queueFallbackSettlement = useCallback((amount: bigint) => {
    setPendingSettlementAmount(amount);
    console.log("[Shield] Queued fallback settlement:", amount.toString());
  }, []);

  const settlePending = useCallback(async (): Promise<ShieldResult> => {
    if (!pendingSettlementAmount || pendingSettlementAmount <= BigInt(0)) {
      return {
        success: false,
        error: "No pending settlement",
        timestamp: Date.now(),
      };
    }

    setIsShielding(true);
    setShieldError(null);

    try {
      console.log("[Shield] Attempting fallback settlement for", pendingSettlementAmount.toString());

      const settlementResult = await lightProtocol.settlePrivatePnL(
        pendingSettlementAmount,
        USDC_MINT
      );

      if (settlementResult.success) {
        const settled = pendingSettlementAmount;
        setPendingSettlementAmount(null);

        const result: ShieldResult = {
          success: true,
          signature: settlementResult.signature,
          settledAmount: settled,
          pendingSettlement: false,
          phase: "compress",
          timestamp: Date.now(),
        };

        setLastShieldResult(result);
        console.log("[Shield] Fallback settlement completed:", settlementResult.signature);
        return result;
      }

      const result: ShieldResult = {
        success: false,
        error: settlementResult.error || "Settlement failed",
        pendingSettlement: true,
        pendingSettlementAmount: pendingSettlementAmount,
        phase: "compress",
        timestamp: Date.now(),
      };

      setShieldError(result.error!);
      setLastShieldResult(result);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Settlement failed";
      console.error("[Shield] Fallback settlement error:", err);

      const result: ShieldResult = {
        success: false,
        error: errorMessage,
        pendingSettlement: true,
        pendingSettlementAmount: pendingSettlementAmount,
        timestamp: Date.now(),
      };

      setShieldError(errorMessage);
      setLastShieldResult(result);
      return result;
    } finally {
      setIsShielding(false);
    }
  }, [pendingSettlementAmount, lightProtocol]);

  const executeShieldedTrade = useCallback(
    async (params: ShieldTradeParams): Promise<ShieldResult> => {
      if (!isConnected || !walletAddress) {
        const error = "Wallet not connected";
        setShieldError(error);
        return {
          success: false,
          error,
          timestamp: Date.now(),
        };
      }

      if (!shieldMode) {
        const error = "Shield mode not enabled";
        setShieldError(error);
        return {
          success: false,
          error,
          timestamp: Date.now(),
        };
      }

      setIsShielding(true);
      setShieldError(null);

      try {
        const collateralAmountBigInt = BigInt(
          Math.floor(params.collateralAmount * Math.pow(10, USDC_DECIMALS))
        );

        if (isDevMode || isDemoMode) {
          await simulatePhase("decompress", 400);
          await simulatePhase("deposit", 300);
          await simulatePhase("trade", 500);
          await simulatePhase("compress", 400);

          const result: ShieldResult = {
            success: true,
            signature: `shield-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            bundleId: `bundle-${Math.random().toString(36).slice(2, 12)}`,
            timestamp: Date.now(),
          };

          setLastShieldResult(result);
          return result;
        }

        const connection = await createConnection();

        const instructions: import("@solana/web3.js").TransactionInstruction[] = [];

        console.log("[Shield] Building atomic bundle with ZK privacy...");

        const decompressResult = await lightProtocol.buildDecompressInstructionForBundle(
          collateralAmountBigInt,
          USDC_MINT
        );

        if (decompressResult.error) {
          console.warn("[Shield] Decompress instruction unavailable:", decompressResult.error);
        } else if (decompressResult.instruction) {
          instructions.push(decompressResult.instruction);
          console.log("[Shield] Added Light Protocol DECOMPRESS instruction");
        }

        const depositIx = await drift.getDepositInstruction(
          collateralAmountBigInt,
          USDC_MINT
        );

        if (depositIx) {
          instructions.push(depositIx);
          console.log("[Shield] Added Drift DEPOSIT instruction");
        }

        const openIx = await drift.getOpenPositionInstruction({
          token: params.token,
          side: params.side,
          collateralAmount: params.collateralAmount,
          leverage: params.leverage,
          slippageBps: params.slippageBps,
        });

        if (openIx) {
          instructions.push(openIx);
          console.log("[Shield] Added Drift OPEN POSITION instruction");
        }

        const compressResult = await lightProtocol.buildCompressInstructionForBundle(
          collateralAmountBigInt,
          USDC_MINT
        );

        if (compressResult.error) {
          console.warn("[Shield] Compress instruction unavailable:", compressResult.error);
        } else if (compressResult.instruction) {
          instructions.push(compressResult.instruction);
          console.log("[Shield] Added Light Protocol COMPRESS instruction");
        }

        const hasLightProtocolInstructions =
          decompressResult.instruction !== null || compressResult.instruction !== null;

        if (!hasLightProtocolInstructions) {
          console.error(
            "[Shield] Light Protocol instructions unavailable - cannot execute shielded trade"
          );
          const result: ShieldResult = {
            success: false,
            error: "ZK privacy layer unavailable. Cannot execute shielded trade. Please check Light Protocol configuration.",
            phase: "decompress",
            timestamp: Date.now(),
          };

          setShieldError(result.error!);
          setLastShieldResult(result);
          return result;
        }

        if (instructions.length === 0) {
          throw new Error("No valid instructions to bundle");
        }

        console.log(`[Shield] Submitting Jito bundle with ${instructions.length} instructions`);

        const payer = await toPublicKey(walletAddress);

        if (walletStatus.status !== "connected" || !walletStatus.session.signTransaction) {
          throw new Error("Wallet does not support transaction signing");
        }

        const walletSignTransaction = walletStatus.session.signTransaction;

        const signTransaction = async <T extends { serialize: () => Uint8Array }>(
          tx: T
        ): Promise<T> => {
          const signedTx = await walletSignTransaction(tx as unknown as Parameters<typeof walletSignTransaction>[0]);
          return signedTx as unknown as T;
        };

        const bundleResult: BundleResult = await submitAtomicBundleWithRetry(
          {
            instructions,
            payer,
            connection,
            signTransaction,
            priorityLevel: "high",
            isDevMode: false,
          },
          {
            maxRetries: 3,
            tipEscalation: 1.5,
            maxTipLamports: 500_000,
          }
        );

        const result: ShieldResult = {
          success: bundleResult.success,
          signature: bundleResult.signature,
          bundleId: bundleResult.bundleId,
          error: bundleResult.error,
          phase: bundleResult.success ? "compress" : undefined,
          timestamp: Date.now(),
        };

        setLastShieldResult(result);

        if (!result.success && result.error) {
          setShieldError(result.error);
        } else {
          console.log("[Shield] Atomic shielded trade completed successfully");
        }

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Shielded trade failed";
        console.error("[Shield] Trade error:", err);

        const result: ShieldResult = {
          success: false,
          error: errorMessage,
          timestamp: Date.now(),
        };

        setShieldError(errorMessage);
        setLastShieldResult(result);
        return result;
      } finally {
        setIsShielding(false);
      }
    },
    [isConnected, walletAddress, shieldMode, isDevMode, drift, lightProtocol, walletStatus]
  );

  const executeShieldedClose = useCallback(
    async (params: ShieldCloseParams): Promise<ShieldResult> => {
      if (!isConnected || !walletAddress) {
        const error = "Wallet not connected";
        setShieldError(error);
        return {
          success: false,
          error,
          timestamp: Date.now(),
        };
      }

      if (!shieldMode) {
        const error = "Shield mode not enabled";
        setShieldError(error);
        return {
          success: false,
          error,
          timestamp: Date.now(),
        };
      }

      setIsShielding(true);
      setShieldError(null);

      try {
        if (isDevMode || isDemoMode) {
          const mockCollateral = BigInt(100 * Math.pow(10, USDC_DECIMALS));
          const mockPnl = BigInt(Math.floor((Math.random() * 40 - 20) * Math.pow(10, USDC_DECIMALS)));
          const mockTotal = mockCollateral + mockPnl;
          const mockPercentage = params.percentage ?? 100;

          await simulatePhase("trade", 500);

          if (mockTotal > BigInt(0)) {
            const mockWithdraw = mockPercentage < 100
              ? (mockTotal * BigInt(mockPercentage)) / BigInt(100)
              : mockTotal;
            await simulatePhase("withdraw", 300);
            await simulatePhase("compress", 400);

            const result: ShieldResult = {
              success: true,
              signature: `shield-close-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              bundleId: `bundle-close-${Math.random().toString(36).slice(2, 12)}`,
              settledAmount: mockWithdraw,
              realizedLoss: mockPnl < BigInt(0) ? -mockPnl : BigInt(0),
              timestamp: Date.now(),
            };

            setLastShieldResult(result);
            return result;
          }

          const result: ShieldResult = {
            success: true,
            signature: `shield-close-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            bundleId: `bundle-close-${Math.random().toString(36).slice(2, 12)}`,
            settledAmount: BigInt(0),
            realizedLoss: mockPnl < BigInt(0) ? -mockPnl : BigInt(0),
            timestamp: Date.now(),
          };

          setLastShieldResult(result);
          return result;
        }

        const connection = await createConnection();

        const instructions: import("@solana/web3.js").TransactionInstruction[] = [];

        console.log("[Shield] Building atomic close bundle with ZK privacy...");

        const closingPosition = drift.positions.find(p => p.id === params.positionId);
        if (!closingPosition) {
          const result: ShieldResult = {
            success: false,
            error: "Position not found",
            timestamp: Date.now(),
          };
          setShieldError(result.error!);
          setLastShieldResult(result);
          return result;
        }

        const closeIx = await drift.getClosePositionInstruction({
          positionId: params.positionId,
          token: params.token,
          side: params.side,
          percentage: params.percentage,
        });

        if (closeIx) {
          instructions.push(closeIx);
          console.log("[Shield] Added Drift CLOSE POSITION instruction");
        }

        const collateralAmount = BigInt(closingPosition.quoteAssetAmount);
        const pnlAmount = BigInt(Math.floor(closingPosition.unrealizedPnl * Math.pow(10, USDC_DECIMALS)));
        const realizedLoss = pnlAmount < BigInt(0) ? -pnlAmount : BigInt(0);

        const percentage = params.percentage ?? 100;
        const totalAmount = collateralAmount + pnlAmount;
        console.log(`[Shield] Position value: collateral=${collateralAmount}, pnl=${pnlAmount}, total=${totalAmount}, percentage=${percentage}%`);

        let settledAmount = BigInt(0);
        let compressIncluded = false;

        if (totalAmount > BigInt(0)) {
          const withdrawAmount = percentage < 100
            ? (totalAmount * BigInt(percentage)) / BigInt(100)
            : totalAmount;
          settledAmount = withdrawAmount;

          console.log(`[Shield] Withdrawing ${withdrawAmount} (has remaining value)`);

          const withdrawIx = await drift.getWithdrawInstruction(
            withdrawAmount,
            USDC_MINT
          );

          if (withdrawIx) {
            instructions.push(withdrawIx);
            console.log("[Shield] Added Drift WITHDRAW instruction");
          }

          const compressResult = await lightProtocol.buildCompressInstructionForBundle(
            withdrawAmount,
            USDC_MINT
          );

          if (compressResult.error) {
            console.warn("[Shield] Compress instruction unavailable:", compressResult.error);
          } else if (compressResult.instruction) {
            instructions.push(compressResult.instruction);
            compressIncluded = true;
            console.log("[Shield] Added Light Protocol COMPRESS instruction");
          }

          if (!compressIncluded) {
            console.warn("[Shield] Proceeding without compress — will attempt fallback settlement");
          }
        } else {
          console.log(`[Shield] Total loss — skipping withdraw/compress, closing position only`);
        }

        if (instructions.length === 0) {
          throw new Error("No valid instructions to bundle for close");
        }

        console.log(`[Shield] Submitting Jito close bundle with ${instructions.length} instructions`);

        const payer = await toPublicKey(walletAddress);

        if (walletStatus.status !== "connected" || !walletStatus.session.signTransaction) {
          throw new Error("Wallet does not support transaction signing");
        }

        const walletSignTransaction = walletStatus.session.signTransaction;

        const signTransaction = async <T extends { serialize: () => Uint8Array }>(
          tx: T
        ): Promise<T> => {
          const signedTx = await walletSignTransaction(tx as unknown as Parameters<typeof walletSignTransaction>[0]);
          return signedTx as unknown as T;
        };

        const bundleResult: BundleResult = await submitAtomicBundleWithRetry(
          {
            instructions,
            payer,
            connection,
            signTransaction,
            priorityLevel: "high",
            isDevMode: false,
          },
          {
            maxRetries: 3,
            tipEscalation: 1.5,
            maxTipLamports: 500_000,
          }
        );

        const needsFallbackSettlement = bundleResult.success && !compressIncluded && settledAmount > BigInt(0);

        const result: ShieldResult = {
          success: bundleResult.success,
          signature: bundleResult.signature,
          bundleId: bundleResult.bundleId,
          error: bundleResult.error,
          phase: bundleResult.success ? (compressIncluded ? "compress" : "withdraw") : undefined,
          realizedLoss: realizedLoss,
          settledAmount: settledAmount,
          pendingSettlement: needsFallbackSettlement,
          pendingSettlementAmount: needsFallbackSettlement ? settledAmount : undefined,
          timestamp: Date.now(),
        };

        setLastShieldResult(result);

        if (!result.success && result.error) {
          setShieldError(result.error);
        } else {
          console.log("[Shield] Shielded close completed", compressIncluded ? "with settlement privacy" : "— pending settlement");
        }

        if (needsFallbackSettlement) {
          console.log("[Shield] Scheduling fallback settlement for", settledAmount.toString());
          lightProtocol.addPendingSettlement();
          queueFallbackSettlement(settledAmount);
        }

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Shielded close failed";
        console.error("[Shield] Close error:", err);

        const result: ShieldResult = {
          success: false,
          error: errorMessage,
          timestamp: Date.now(),
        };

        setShieldError(errorMessage);
        setLastShieldResult(result);
        return result;
      } finally {
        setIsShielding(false);
      }
    },
    [isConnected, walletAddress, shieldMode, isDevMode, drift, lightProtocol, walletStatus, queueFallbackSettlement]
  );

  const prefundFromCompressed = useCallback(
    async (amount: number): Promise<ShieldResult> => {
      if (!isConnected || !walletAddress) {
        const error = "Wallet not connected";
        setShieldError(error);
        return { success: false, error, timestamp: Date.now() };
      }

      setIsShielding(true);
      setShieldError(null);

      try {
        const amountBigInt = BigInt(Math.floor(amount * Math.pow(10, USDC_DECIMALS)));

        if (isDevMode || isDemoMode) {
          await simulatePhase("decompress", 400);
          await simulatePhase("deposit", 300);

          const result: ShieldResult = {
            success: true,
            signature: `prefund-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            phase: "deposit",
            settledAmount: amountBigInt,
            timestamp: Date.now(),
          };
          setLastShieldResult(result);
          return result;
        }

        const connection = await createConnection();
        const instructions: import("@solana/web3.js").TransactionInstruction[] = [];

        console.log("[Shield] Pre-funding from compressed balance:", amountBigInt.toString());

        const decompressResult = await lightProtocol.buildDecompressInstructionForBundle(
          amountBigInt,
          USDC_MINT
        );

        if (decompressResult.error || !decompressResult.instruction) {
          const result: ShieldResult = {
            success: false,
            error: decompressResult.error || "Failed to build decompress instruction",
            phase: "decompress",
            timestamp: Date.now(),
          };
          setShieldError(result.error!);
          setLastShieldResult(result);
          return result;
        }

        instructions.push(decompressResult.instruction);
        console.log("[Shield] Added DECOMPRESS instruction for pre-fund");

        const depositIx = await drift.getDepositInstruction(amountBigInt, USDC_MINT);
        if (depositIx) {
          instructions.push(depositIx);
          console.log("[Shield] Added DEPOSIT instruction for pre-fund");
        }

        const payer = await toPublicKey(walletAddress);

        if (walletStatus.status !== "connected" || !walletStatus.session.signTransaction) {
          throw new Error("Wallet does not support transaction signing");
        }

        const walletSignTransaction = walletStatus.session.signTransaction;
        const signTransaction = async <T extends { serialize: () => Uint8Array }>(
          tx: T
        ): Promise<T> => {
          const signedTx = await walletSignTransaction(tx as unknown as Parameters<typeof walletSignTransaction>[0]);
          return signedTx as unknown as T;
        };

        const bundleResult: BundleResult = await submitAtomicBundleWithRetry(
          {
            instructions,
            payer,
            connection,
            signTransaction,
            priorityLevel: "medium",
            isDevMode: false,
          },
          {
            maxRetries: 2,
            tipEscalation: 1.3,
            maxTipLamports: 300_000,
          }
        );

        const result: ShieldResult = {
          success: bundleResult.success,
          signature: bundleResult.signature,
          bundleId: bundleResult.bundleId,
          error: bundleResult.error,
          phase: bundleResult.success ? "deposit" : "decompress",
          settledAmount: bundleResult.success ? amountBigInt : BigInt(0),
          timestamp: Date.now(),
        };

        setLastShieldResult(result);

        if (!result.success && result.error) {
          setShieldError(result.error);
        } else {
          console.log("[Shield] Pre-fund completed — Drift account funded from compressed balance");
        }

        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Pre-fund failed";
        console.error("[Shield] Pre-fund error:", err);

        const result: ShieldResult = {
          success: false,
          error: errorMessage,
          timestamp: Date.now(),
        };

        setShieldError(errorMessage);
        setLastShieldResult(result);
        return result;
      } finally {
        setIsShielding(false);
      }
    },
    [isConnected, walletAddress, isDevMode, drift, lightProtocol, walletStatus]
  );

  const executeSimpleTrade = useCallback(
    async (params: ShieldTradeParams): Promise<ShieldResult> => {
      if (!isConnected || !walletAddress) {
        const error = "Wallet not connected";
        setShieldError(error);
        return { success: false, error, timestamp: Date.now() };
      }

      setIsShielding(true);
      setShieldError(null);

      try {
        if (isDevMode || isDemoMode) {
          await simulatePhase("trade", 500);

          const result: ShieldResult = {
            success: true,
            signature: `trade-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            phase: "trade",
            timestamp: Date.now(),
          };
          setLastShieldResult(result);
          return result;
        }

        const connection = await createConnection();

        const openIx = await drift.getOpenPositionInstruction({
          token: params.token,
          side: params.side,
          collateralAmount: params.collateralAmount,
          leverage: params.leverage,
          slippageBps: params.slippageBps,
        });

        if (!openIx) {
          throw new Error("Failed to build open position instruction");
        }

        const payer = await toPublicKey(walletAddress);

        if (walletStatus.status !== "connected" || !walletStatus.session.signTransaction) {
          throw new Error("Wallet does not support transaction signing");
        }

        const walletSignTransaction = walletStatus.session.signTransaction;
        const signTransaction = async <T extends { serialize: () => Uint8Array }>(
          tx: T
        ): Promise<T> => {
          const signedTx = await walletSignTransaction(tx as unknown as Parameters<typeof walletSignTransaction>[0]);
          return signedTx as unknown as T;
        };

        const bundleResult: BundleResult = await submitAtomicBundleWithRetry(
          {
            instructions: [openIx],
            payer,
            connection,
            signTransaction,
            priorityLevel: "high",
            isDevMode: false,
          },
          {
            maxRetries: 3,
            tipEscalation: 1.5,
            maxTipLamports: 500_000,
          }
        );

        const result: ShieldResult = {
          success: bundleResult.success,
          signature: bundleResult.signature,
          bundleId: bundleResult.bundleId,
          error: bundleResult.error,
          phase: bundleResult.success ? "trade" : undefined,
          timestamp: Date.now(),
        };

        setLastShieldResult(result);

        if (!result.success && result.error) {
          setShieldError(result.error);
        } else {
          console.log("[Shield] Simple trade executed — no Light Protocol needed");
        }

        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Trade failed";
        console.error("[Shield] Simple trade error:", err);

        const result: ShieldResult = {
          success: false,
          error: errorMessage,
          timestamp: Date.now(),
        };

        setShieldError(errorMessage);
        setLastShieldResult(result);
        return result;
      } finally {
        setIsShielding(false);
      }
    },
    [isConnected, walletAddress, isDevMode, drift, walletStatus]
  );

  return {
    isShielding,
    shieldError,
    lastShieldResult,
    shieldMode,
    hasPendingSettlement,
    enableShieldMode,
    disableShieldMode,
    executeShieldedTrade,
    executeShieldedClose,
    prefundFromCompressed,
    executeSimpleTrade,
    settlePending,
    canShield,
  };
}
