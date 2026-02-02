"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useWallet, useWalletActions } from "@solana/react-hooks";
import { useTradingStore, type Position, type TriggerOrder } from "../stores/trading-store";
import { usePriceStore } from "../stores/price-store";
import { useDevMode } from "./use-dev-mode";
import { useDemoMode } from "./use-demo-mode";
import { useVault } from "./use-vault";
import { BN } from "@coral-xyz/anchor";
import {
  toPublicKey,
  createConnection,
  buildVersionedTransaction,
  simulateTransaction,
  serializeTransactionBase64,
  createComputeBudgetInstructions,
  withBlockhashRetry,
} from "../lib/solana-adapter";
import type {
  DriftPositionSimplified,
  OpenPositionParamsSimplified,
  ClosePositionParamsSimplified,
  PlaceTriggerOrderParamsSimplified,
  TradeResult,
  DriftConfig,
} from "../types/drift";
import {
  DRIFT_MARKET_INDICES,
  DRIFT_PRECISION,
  DRIFT_DEFAULT_CONFIG,
} from "../types/drift";
import {
  deriveUserPDA,
  deriveUserStatsPDA,
  deriveSpotMarketVaultPDA,
  derivePerpMarketPDA,
  deriveStatePDA,
  buildInitializeUserInstruction,
  buildDepositInstruction,
  buildWithdrawInstruction,
  buildOpenPerpPositionInstruction,
  buildClosePerpPositionInstruction,
  buildPlaceTriggerOrderInstruction,
  buildCancelOrderInstruction,
  inferTriggerCondition,
  USDC_SPOT_MARKET_INDEX,
  QUOTE_PRECISION,
  BASE_PRECISION,
  PRICE_PRECISION,
} from "../lib/drift-instructions";
import { isDriftUserInitialized } from "../lib/drift-verification";

const MOCK_PRICES: Record<string, number> = {
  SOL: 178.5,
  BTC: 65000,
  ETH: 3400,
};

const TOKEN_TO_MARKET_INDEX: Record<string, number> = {
  SOL: DRIFT_MARKET_INDICES["SOL-PERP"],
  BTC: DRIFT_MARKET_INDICES["BTC-PERP"],
  ETH: DRIFT_MARKET_INDICES["ETH-PERP"],
};

const DEFAULT_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const DEFAULT_ENV =
  (process.env.NEXT_PUBLIC_DRIFT_ENV as "mainnet-beta" | "devnet") || "mainnet-beta";

interface DriftClientState {
  isInitialized: boolean;
  isUserAccountInitialized: boolean;
  isCheckingInit: boolean;
  userPDA: string | null;
  error: string | null;
}

function generateMockPosition(
  params: OpenPositionParamsSimplified,
  entryPrice: number
): DriftPositionSimplified {
  const size = params.collateralAmount * params.leverage;
  const liquidationDistance = entryPrice / params.leverage;
  const liquidationPrice =
    params.side === "long"
      ? entryPrice - liquidationDistance * 0.9
      : entryPrice + liquidationDistance * 0.9;

  const baseAssetAmount = new BN(Math.floor(size * DRIFT_PRECISION.BASE));
  const quoteAssetAmount = new BN(
    Math.floor(params.collateralAmount * DRIFT_PRECISION.QUOTE)
  );

  return {
    id: `drift-pos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    token: params.token,
    marketIndex: TOKEN_TO_MARKET_INDEX[params.token] || 0,
    side: params.side,
    size,
    entryPrice,
    markPrice: entryPrice,
    leverage: params.leverage,
    unrealizedPnl: 0,
    liquidationPrice,
    baseAssetAmount: baseAssetAmount.toString(),
    quoteAssetAmount: quoteAssetAmount.toString(),
    timestamp: Date.now(),
  };
}

function generateMockPositions(): DriftPositionSimplified[] {
  if (Math.random() > 0.6) {
    return [
      {
        id: `drift-pos-${Date.now()}-mock1`,
        token: "SOL",
        marketIndex: 0,
        side: "long",
        size: 500,
        entryPrice: 175.2,
        markPrice: 178.5,
        leverage: 5,
        unrealizedPnl: 18.75,
        liquidationPrice: 140.16,
        baseAssetAmount: new BN(500 * DRIFT_PRECISION.BASE).toString(),
        quoteAssetAmount: new BN(100 * DRIFT_PRECISION.QUOTE).toString(),
        timestamp: Date.now() - 3600000,
      },
    ];
  }
  return [];
}

export interface UseDriftReturn {
  isInitialized: boolean;
  isUserAccountInitialized: boolean;
  isCheckingInit: boolean;
  isLoading: boolean;
  error: string | null;
  positions: DriftPositionSimplified[];
  freeCollateral: number;

  triggerOrders: TriggerOrder[];
  getTriggerOrdersForPosition: (positionId: string) => TriggerOrder[];

  initialize(): Promise<boolean>;
  initializeUser(): Promise<string | null>;
  deposit(amount: number, mint: string): Promise<TradeResult>;
  withdraw(amount: number, mint: string): Promise<TradeResult>;
  openPosition(params: OpenPositionParamsSimplified): Promise<TradeResult>;
  closePosition(params: ClosePositionParamsSimplified): Promise<TradeResult>;

  placeTriggerOrder(params: PlaceTriggerOrderParamsSimplified): Promise<TradeResult>;
  cancelTriggerOrder(orderId: string): Promise<TradeResult>;

  getDepositInstruction(
    amount: bigint,
    mint: string
  ): Promise<import("@solana/web3.js").TransactionInstruction | null>;
  getWithdrawInstruction(
    amount: bigint,
    mint: string
  ): Promise<import("@solana/web3.js").TransactionInstruction | null>;
  getOpenPositionInstruction(
    params: OpenPositionParamsSimplified
  ): Promise<import("@solana/web3.js").TransactionInstruction | null>;
  getClosePositionInstruction(
    params: ClosePositionParamsSimplified
  ): Promise<import("@solana/web3.js").TransactionInstruction | null>;
}

export function useDrift(config?: DriftConfig): UseDriftReturn {
  const { isDevMode } = useDevMode();
  const { isDemoMode } = useDemoMode();
  const wallet = useWallet();
  const walletActions = useWalletActions();
  const {
    addPosition,
    removePosition,
    positions: storePositions,
    addTriggerOrder,
    removeTriggerOrder,
    triggerOrders,
    getTriggerOrdersForPosition,
  } = useTradingStore();
  const { getPrice } = usePriceStore();
  const { canTrade, recordTrade, vault: vaultData } = useVault();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientState, setClientState] = useState<DriftClientState>({
    isInitialized: false,
    isUserAccountInitialized: false,
    isCheckingInit: false,
    userPDA: null,
    error: null,
  });
  const [mockFreeCollateral] = useState(() =>
    Math.floor(Math.random() * 900 + 100)
  );
  const [mockPositions] = useState<DriftPositionSimplified[]>(() =>
    generateMockPositions()
  );

  const rpcUrl = config?.rpcUrl || DEFAULT_RPC_URL;
  const priorityFee = config?.priorityFee || DRIFT_DEFAULT_CONFIG.priorityFee!;
  const slippageBps = config?.slippageBps || DRIFT_DEFAULT_CONFIG.slippageBps!;
  const subAccountId = config?.subAccountId || DRIFT_DEFAULT_CONFIG.subAccountId!;
  const env = config?.env || DEFAULT_ENV;

  const isConnected = wallet.status === "connected";
  const walletAddress =
    wallet.status === "connected" ? wallet.session.account.address : null;

  useEffect(() => {
    if (isDevMode || isDemoMode) {
      setClientState({
        isInitialized: true,
        isUserAccountInitialized: true,
        isCheckingInit: false,
        userPDA: "DevMockDriftUser11111111111111111111111",
        error: null,
      });
      return;
    }

    if (!isConnected || !walletAddress) {
      setClientState({
        isInitialized: false,
        isUserAccountInitialized: false,
        isCheckingInit: false,
        userPDA: null,
        error: null,
      });
      return;
    }

    let cancelled = false;

    async function initDriftClient() {
      setClientState((prev) => ({ ...prev, isCheckingInit: true }));

      try {
        const authority = await toPublicKey(walletAddress!);
        const userPDA = deriveUserPDA(authority, subAccountId);

        const connection = await createConnection(rpcUrl);
        const isUserInit = await isDriftUserInitialized(connection, authority, subAccountId);

        if (!cancelled) {
          setClientState({
            isInitialized: true,
            isUserAccountInitialized: isUserInit,
            isCheckingInit: false,
            userPDA: userPDA.toString(),
            error: null,
          });

          if (!isUserInit) {
            console.log("[Drift] User account not initialized, call initializeUser() to create");
          }
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error
              ? err.message
              : "Failed to initialize Drift client";
          console.error("Drift init error:", err);
          setClientState({
            isInitialized: false,
            isUserAccountInitialized: false,
            isCheckingInit: false,
            userPDA: null,
            error: message,
          });
        }
      }
    }

    initDriftClient();

    return () => {
      cancelled = true;
    };
  }, [isDevMode, isConnected, walletAddress, subAccountId, rpcUrl]);

  const isInitialized = isDevMode || isDemoMode || (isConnected && clientState.isInitialized);

  const positions = useMemo<DriftPositionSimplified[]>(() => {
    if (isDevMode || isDemoMode) {
      return mockPositions;
    }

    return storePositions
      .filter((p) => p.id.startsWith("drift-pos-"))
      .map((p) => ({
        id: p.id,
        token: p.token,
        marketIndex: TOKEN_TO_MARKET_INDEX[p.token] || 0,
        side: p.side,
        size: p.size,
        entryPrice: p.entryPrice,
        markPrice: getPrice(p.token) || p.entryPrice,
        leverage: p.leverage,
        unrealizedPnl: p.unrealizedPnl,
        liquidationPrice: p.liquidationPrice,
        baseAssetAmount: new BN(Math.floor(p.size * DRIFT_PRECISION.BASE)).toString(),
        quoteAssetAmount: new BN(
          Math.floor((p.size / p.leverage) * DRIFT_PRECISION.QUOTE)
        ).toString(),
        timestamp: p.timestamp,
      }));
  }, [isDevMode, mockPositions, storePositions, getPrice]);

  const freeCollateral = useMemo(() => {
    if (isDevMode || isDemoMode) {
      return mockFreeCollateral;
    }
    return 0;
  }, [isDevMode, mockFreeCollateral]);

  const initialize = useCallback(async (): Promise<boolean> => {
    if (isDevMode || isDemoMode) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return true;
    }

    if (!isConnected || !walletAddress) {
      setError("Wallet not connected");
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const authority = await toPublicKey(walletAddress);
      const initIx = buildInitializeUserInstruction({
        authority,
        payer: authority,
        subAccountNumber: subAccountId,
        name: "Beneat",
      });

      const connection = await createConnection(rpcUrl);
      const computeIxs = await createComputeBudgetInstructions(200_000, priorityFee);

      const { transaction, blockhash, lastValidBlockHeight } =
        await buildVersionedTransaction(connection, authority, [
          ...computeIxs,
          initIx,
        ]);

      const simResult = await simulateTransaction(connection, transaction);
      if (!simResult.success) {
        throw new Error(`Simulation failed: ${simResult.error}`);
      }

      const base64Tx = serializeTransactionBase64(transaction);

      await withBlockhashRetry(async () => {
        await walletActions.sendTransaction(base64Tx as never, "confirmed");
      }, connection);

      const userPDA = deriveUserPDA(authority, subAccountId);
      setClientState({
        isInitialized: true,
        isUserAccountInitialized: true,
        isCheckingInit: false,
        userPDA: userPDA.toString(),
        error: null,
      });

      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to initialize Drift user";
      setError(message);
      console.error("Drift initialize error:", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [
    isDevMode,
    isConnected,
    walletAddress,
    walletActions,
    rpcUrl,
    priorityFee,
    subAccountId,
  ]);

  const initializeUser = useCallback(async (): Promise<string | null> => {
    if (isDevMode || isDemoMode) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return "dev-mock-signature";
    }

    if (!isConnected || !walletAddress) {
      setError("Wallet not connected");
      return null;
    }

    if (clientState.isUserAccountInitialized) {
      console.log("[Drift] User account already initialized");
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const authority = await toPublicKey(walletAddress);
      const connection = await createConnection(rpcUrl);

      const alreadyInit = await isDriftUserInitialized(connection, authority, subAccountId);
      if (alreadyInit) {
        setClientState((prev) => ({ ...prev, isUserAccountInitialized: true }));
        console.log("[Drift] User account was already initialized");
        return null;
      }

      const initIx = buildInitializeUserInstruction({
        authority,
        payer: authority,
        subAccountNumber: subAccountId,
        name: "Beneat",
      });

      const computeIxs = await createComputeBudgetInstructions(200_000, priorityFee);

      const { transaction } = await buildVersionedTransaction(connection, authority, [
        ...computeIxs,
        initIx,
      ]);

      const simResult = await simulateTransaction(connection, transaction);
      if (!simResult.success) {
        throw new Error(`Simulation failed: ${simResult.error}`);
      }

      const base64Tx = serializeTransactionBase64(transaction);

      const signature = await withBlockhashRetry(async () => {
        return await walletActions.sendTransaction(base64Tx as never, "confirmed");
      }, connection);

      const userPDA = deriveUserPDA(authority, subAccountId);
      setClientState({
        isInitialized: true,
        isUserAccountInitialized: true,
        isCheckingInit: false,
        userPDA: userPDA.toString(),
        error: null,
      });

      console.log("[Drift] User account initialized:", signature);
      return signature as string;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to initialize Drift user";
      setError(message);
      console.error("Drift initializeUser error:", err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [
    isDevMode,
    isConnected,
    walletAddress,
    walletActions,
    clientState.isUserAccountInitialized,
    rpcUrl,
    priorityFee,
    subAccountId,
  ]);

  const deposit = useCallback(
    async (amount: number, mint: string): Promise<TradeResult> => {
      setIsLoading(true);
      setError(null);

      try {
        if (isDevMode || isDemoMode) {
          await new Promise((resolve) => setTimeout(resolve, 600));
          return {
            success: true,
            signature: `drift-deposit-${Date.now()}`,
            timestamp: Date.now(),
          };
        }

        if (!isConnected || !walletAddress) {
          throw new Error("Wallet not connected");
        }

        if (!clientState.isInitialized) {
          throw new Error("Drift user not initialized");
        }

        const amountBN = new BN(Math.floor(amount * 1_000_000));

        const authority = await toPublicKey(walletAddress);
        const userPDA = deriveUserPDA(authority, subAccountId);

        const { getAssociatedTokenAddressSync } = await import(
          "@solana/spl-token"
        );
        const usdcMint = await toPublicKey(
          "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
        );
        const tokenAccount = getAssociatedTokenAddressSync(usdcMint, authority);

        const depositIx = buildDepositInstruction({
          amount: amountBN,
          spotMarketIndex: USDC_SPOT_MARKET_INDEX,
          userPDA,
          authority,
          tokenAccount,
        });

        const connection = await createConnection(rpcUrl);
        const computeIxs = await createComputeBudgetInstructions(300_000, priorityFee);

        const { transaction } = await buildVersionedTransaction(
          connection,
          authority,
          [...computeIxs, depositIx]
        );

        const simResult = await simulateTransaction(connection, transaction);
        if (!simResult.success) {
          throw new Error(`Simulation failed: ${simResult.error}`);
        }

        const base64Tx = serializeTransactionBase64(transaction);

        const signature = await withBlockhashRetry(async () => {
          return await walletActions.sendTransaction(base64Tx as never, "confirmed");
        }, connection);

        return {
          success: true,
          signature: signature as string,
          timestamp: Date.now(),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Deposit failed";
        setError(message);
        console.error("Drift deposit error:", err);
        return {
          success: false,
          error: message,
          timestamp: Date.now(),
        };
      } finally {
        setIsLoading(false);
      }
    },
    [
      isDevMode,
      isConnected,
      walletAddress,
      walletActions,
      clientState.isInitialized,
      rpcUrl,
      priorityFee,
      subAccountId,
    ]
  );

  const withdraw = useCallback(
    async (amount: number, mint: string): Promise<TradeResult> => {
      setIsLoading(true);
      setError(null);

      try {
        if (isDevMode || isDemoMode) {
          await new Promise((resolve) => setTimeout(resolve, 600));
          return {
            success: true,
            signature: `drift-withdraw-${Date.now()}`,
            timestamp: Date.now(),
          };
        }

        if (!isConnected || !walletAddress) {
          throw new Error("Wallet not connected");
        }

        if (!clientState.isInitialized) {
          throw new Error("Drift user not initialized");
        }

        const amountBN = new BN(Math.floor(amount * 1_000_000));

        const authority = await toPublicKey(walletAddress);
        const userPDA = deriveUserPDA(authority, subAccountId);

        const { getAssociatedTokenAddressSync } = await import(
          "@solana/spl-token"
        );
        const usdcMint = await toPublicKey(
          "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
        );
        const tokenAccount = getAssociatedTokenAddressSync(usdcMint, authority);

        const withdrawIx = buildWithdrawInstruction({
          amount: amountBN,
          spotMarketIndex: USDC_SPOT_MARKET_INDEX,
          userPDA,
          authority,
          tokenAccount,
        });

        const connection = await createConnection(rpcUrl);
        const computeIxs = await createComputeBudgetInstructions(300_000, priorityFee);

        const { transaction } = await buildVersionedTransaction(
          connection,
          authority,
          [...computeIxs, withdrawIx]
        );

        const simResult = await simulateTransaction(connection, transaction);
        if (!simResult.success) {
          throw new Error(`Simulation failed: ${simResult.error}`);
        }

        const base64Tx = serializeTransactionBase64(transaction);

        const signature = await withBlockhashRetry(async () => {
          return await walletActions.sendTransaction(base64Tx as never, "confirmed");
        }, connection);

        return {
          success: true,
          signature: signature as string,
          timestamp: Date.now(),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Withdraw failed";
        setError(message);
        console.error("Drift withdraw error:", err);
        return {
          success: false,
          error: message,
          timestamp: Date.now(),
        };
      } finally {
        setIsLoading(false);
      }
    },
    [
      isDevMode,
      isConnected,
      walletAddress,
      walletActions,
      clientState.isInitialized,
      rpcUrl,
      priorityFee,
      subAccountId,
    ]
  );

  const openPosition = useCallback(
    async (params: OpenPositionParamsSimplified): Promise<TradeResult> => {
      setIsLoading(true);
      setError(null);

      try {
        if (vaultData) {
          const validation = canTrade();
          if (!validation.allowed) {
            throw new Error(`Trade blocked: ${validation.reason}`);
          }
        }

        if (isDevMode || isDemoMode) {
          await new Promise((resolve) => setTimeout(resolve, 800));
          const entryPrice = MOCK_PRICES[params.token] || 100;
          const position = generateMockPosition(params, entryPrice);

          const storePosition: Position = {
            id: position.id,
            token: position.token,
            side: position.side,
            size: position.size,
            entryPrice: position.entryPrice,
            leverage: position.leverage,
            unrealizedPnl: position.unrealizedPnl,
            liquidationPrice: position.liquidationPrice,
            timestamp: position.timestamp,
          };

          addPosition(storePosition);
          recordTrade(false);

          return {
            success: true,
            signature: `drift-open-${Date.now()}`,
            position,
            executedPrice: entryPrice,
            executedSize: position.size,
            timestamp: Date.now(),
          };
        }

        if (!isConnected || !walletAddress) {
          throw new Error("Wallet not connected");
        }

        if (!clientState.isInitialized) {
          throw new Error("Drift user not initialized");
        }

        const marketIndex = TOKEN_TO_MARKET_INDEX[params.token];
        if (marketIndex === undefined) {
          throw new Error(`Unsupported token: ${params.token}`);
        }

        const marketPrice = getPrice(params.token) || MOCK_PRICES[params.token];
        if (!marketPrice) {
          throw new Error(`No price available for ${params.token}`);
        }

        const sizeUsd = params.collateralAmount * params.leverage;
        const baseAssetAmount = new BN(
          Math.floor((sizeUsd / marketPrice) * DRIFT_PRECISION.BASE)
        );

        const authority = await toPublicKey(walletAddress);
        const userPDA = deriveUserPDA(authority, subAccountId);

        const limitPriceBN = params.limitPrice
          ? new BN(Math.floor(params.limitPrice * DRIFT_PRECISION.PRICE))
          : undefined;

        const openIx = buildOpenPerpPositionInstruction({
          marketIndex,
          baseAssetAmount,
          direction: params.side,
          userPDA,
          authority,
          orderType: params.limitPrice ? "limit" : "market",
          price: limitPriceBN,
          reduceOnly: params.reduceOnly ?? false,
          postOnly: params.postOnly ?? false,
          immediateOrCancel: params.immediateOrCancel ?? false,
        });

        const connection = await createConnection(rpcUrl);
        const computeIxs = await createComputeBudgetInstructions(600_000, priorityFee);

        const { transaction } = await buildVersionedTransaction(
          connection,
          authority,
          [...computeIxs, openIx]
        );

        const simResult = await simulateTransaction(connection, transaction);
        if (!simResult.success) {
          throw new Error(`Simulation failed: ${simResult.error}`);
        }

        const base64Tx = serializeTransactionBase64(transaction);

        const signature = await withBlockhashRetry(async () => {
          return await walletActions.sendTransaction(base64Tx as never, "confirmed");
        }, connection);

        const liquidationDistance = marketPrice / params.leverage;
        const liquidationPrice =
          params.side === "long"
            ? marketPrice - liquidationDistance * 0.9
            : marketPrice + liquidationDistance * 0.9;

        const position: DriftPositionSimplified = {
          id: `drift-pos-${(signature as string).slice(0, 8)}`,
          token: params.token,
          marketIndex,
          side: params.side,
          size: sizeUsd,
          entryPrice: marketPrice,
          markPrice: marketPrice,
          leverage: params.leverage,
          unrealizedPnl: 0,
          liquidationPrice,
          baseAssetAmount: baseAssetAmount.toString(),
          quoteAssetAmount: new BN(
            Math.floor(params.collateralAmount * DRIFT_PRECISION.QUOTE)
          ).toString(),
          timestamp: Date.now(),
        };

        const storePosition: Position = {
          id: position.id,
          token: position.token,
          side: position.side,
          size: position.size,
          entryPrice: position.entryPrice,
          leverage: position.leverage,
          unrealizedPnl: position.unrealizedPnl,
          liquidationPrice: position.liquidationPrice,
          timestamp: position.timestamp,
        };

        addPosition(storePosition);
        recordTrade(false);

        return {
          success: true,
          signature: signature as string,
          position,
          executedPrice: marketPrice,
          executedSize: sizeUsd,
          timestamp: Date.now(),
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to open position";
        setError(message);
        console.error("Drift openPosition error:", err);
        return {
          success: false,
          error: message,
          timestamp: Date.now(),
        };
      } finally {
        setIsLoading(false);
      }
    },
    [
      isDevMode,
      isConnected,
      walletAddress,
      walletActions,
      clientState.isInitialized,
      getPrice,
      addPosition,
      vaultData,
      canTrade,
      recordTrade,
      rpcUrl,
      priorityFee,
      subAccountId,
    ]
  );

  const closePosition = useCallback(
    async (params: ClosePositionParamsSimplified): Promise<TradeResult> => {
      setIsLoading(true);
      setError(null);

      try {
        if (vaultData) {
          const validation = canTrade();
          if (!validation.allowed) {
            throw new Error(`Trade blocked: ${validation.reason}`);
          }
        }

        const closingPosition = positions.find((p) => p.id === params.positionId);
        const wasLoss = closingPosition ? closingPosition.unrealizedPnl < 0 : false;

        if (isDevMode || isDemoMode) {
          await new Promise((resolve) => setTimeout(resolve, 600));
          removePosition(params.positionId);
          recordTrade(wasLoss);

          return {
            success: true,
            signature: `drift-close-${Date.now()}`,
            timestamp: Date.now(),
          };
        }

        if (!isConnected || !walletAddress) {
          throw new Error("Wallet not connected");
        }

        if (!clientState.isInitialized) {
          throw new Error("Drift user not initialized");
        }

        const marketIndex = TOKEN_TO_MARKET_INDEX[params.token];
        if (marketIndex === undefined) {
          throw new Error(`Unsupported token: ${params.token}`);
        }

        const authority = await toPublicKey(walletAddress);
        const userPDA = deriveUserPDA(authority, subAccountId);

        const percentage = params.percentage || 100;
        let baseAssetAmount: BN | undefined;

        if (closingPosition && percentage < 100) {
          const partialSize =
            (Number(closingPosition.baseAssetAmount) * percentage) / 100;
          baseAssetAmount = new BN(Math.floor(partialSize));
        }

        const closeIx = buildClosePerpPositionInstruction({
          marketIndex,
          userPDA,
          authority,
          baseAssetAmount,
        });

        const connection = await createConnection(rpcUrl);
        const computeIxs = await createComputeBudgetInstructions(600_000, priorityFee);

        const { transaction } = await buildVersionedTransaction(
          connection,
          authority,
          [...computeIxs, closeIx]
        );

        const simResult = await simulateTransaction(connection, transaction);
        if (!simResult.success) {
          throw new Error(`Simulation failed: ${simResult.error}`);
        }

        const base64Tx = serializeTransactionBase64(transaction);

        const signature = await withBlockhashRetry(async () => {
          return await walletActions.sendTransaction(base64Tx as never, "confirmed");
        }, connection);

        removePosition(params.positionId);
        recordTrade(wasLoss);

        return {
          success: true,
          signature: signature as string,
          timestamp: Date.now(),
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to close position";
        setError(message);
        console.error("Drift closePosition error:", err);
        return {
          success: false,
          error: message,
          timestamp: Date.now(),
        };
      } finally {
        setIsLoading(false);
      }
    },
    [
      isDevMode,
      isConnected,
      walletAddress,
      walletActions,
      clientState.isInitialized,
      removePosition,
      positions,
      vaultData,
      canTrade,
      recordTrade,
      rpcUrl,
      priorityFee,
      subAccountId,
    ]
  );

  const placeTriggerOrder = useCallback(
    async (params: PlaceTriggerOrderParamsSimplified): Promise<TradeResult> => {
      setIsLoading(true);
      setError(null);

      try {
        const position = storePositions.find((p) => p.id === params.positionId);
        if (!position) {
          throw new Error("Position not found");
        }

        const marketIndex = TOKEN_TO_MARKET_INDEX[params.token];
        if (marketIndex === undefined) {
          throw new Error(`Unsupported token: ${params.token}`);
        }

        const marketPrice = getPrice(params.token) || MOCK_PRICES[params.token];
        if (!marketPrice) {
          throw new Error(`No price available for ${params.token}`);
        }

        const sizePercent = params.sizePercent ?? 100;
        const sizeUsdPartial = position.size * (sizePercent / 100);
        const baseAssetAmount = new BN(
          Math.floor((sizeUsdPartial / marketPrice) * DRIFT_PRECISION.BASE)
        );

        const triggerCondition = inferTriggerCondition(params.type, params.side);
        const triggerPriceBN = new BN(
          Math.floor(params.triggerPrice * DRIFT_PRECISION.PRICE)
        );

        if (isDevMode || isDemoMode) {
          await new Promise((resolve) => setTimeout(resolve, 500));

          const triggerOrder: TriggerOrder = {
            id: `trigger-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            positionId: params.positionId,
            token: params.token,
            side: params.side,
            type: params.type,
            source: "drift",
            triggerPrice: params.triggerPrice,
            sizeAmount: baseAssetAmount.toString(),
            status: "active",
            timestamp: Date.now(),
          };

          addTriggerOrder(triggerOrder);

          return {
            success: true,
            signature: `drift-trigger-${Date.now()}`,
            timestamp: Date.now(),
          };
        }

        if (!isConnected || !walletAddress) {
          throw new Error("Wallet not connected");
        }

        if (!clientState.isInitialized) {
          throw new Error("Drift user not initialized");
        }

        const authority = await toPublicKey(walletAddress);
        const userPDA = deriveUserPDA(authority, subAccountId);

        const triggerIx = buildPlaceTriggerOrderInstruction({
          marketIndex,
          baseAssetAmount,
          direction: params.side,
          triggerPrice: triggerPriceBN,
          triggerCondition,
          userPDA,
          authority,
        });

        const connection = await createConnection(rpcUrl);
        const computeIxs = await createComputeBudgetInstructions(600_000, priorityFee);

        const { transaction } = await buildVersionedTransaction(
          connection,
          authority,
          [...computeIxs, triggerIx]
        );

        const simResult = await simulateTransaction(connection, transaction);
        if (!simResult.success) {
          throw new Error(`Simulation failed: ${simResult.error}`);
        }

        const base64Tx = serializeTransactionBase64(transaction);

        const signature = await withBlockhashRetry(async () => {
          return await walletActions.sendTransaction(base64Tx as never, "confirmed");
        }, connection);

        const triggerOrder: TriggerOrder = {
          id: `trigger-${(signature as string).slice(0, 8)}`,
          positionId: params.positionId,
          token: params.token,
          side: params.side,
          type: params.type,
          source: "drift",
          triggerPrice: params.triggerPrice,
          sizeAmount: baseAssetAmount.toString(),
          status: "active",
          timestamp: Date.now(),
        };

        addTriggerOrder(triggerOrder);

        return {
          success: true,
          signature: signature as string,
          timestamp: Date.now(),
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to place trigger order";
        setError(message);
        console.error("Drift placeTriggerOrder error:", err);
        return {
          success: false,
          error: message,
          timestamp: Date.now(),
        };
      } finally {
        setIsLoading(false);
      }
    },
    [
      isDevMode,
      storePositions,
      getPrice,
      isConnected,
      walletAddress,
      clientState.isInitialized,
      subAccountId,
      rpcUrl,
      priorityFee,
      walletActions,
      addTriggerOrder,
    ]
  );

  const cancelTriggerOrder = useCallback(
    async (orderId: string): Promise<TradeResult> => {
      setIsLoading(true);
      setError(null);

      try {
        const triggerOrder = triggerOrders.find((o) => o.id === orderId);
        if (!triggerOrder) {
          throw new Error("Trigger order not found");
        }

        if (isDevMode || isDemoMode) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          removeTriggerOrder(orderId);
          return {
            success: true,
            signature: `drift-cancel-trigger-${Date.now()}`,
            timestamp: Date.now(),
          };
        }

        if (!isConnected || !walletAddress) {
          throw new Error("Wallet not connected");
        }

        if (!clientState.isInitialized) {
          throw new Error("Drift user not initialized");
        }

        // If we don't have an on-chain order id yet, we can only remove locally.
        if (triggerOrder.onChainOrderId !== undefined) {
          const authority = await toPublicKey(walletAddress);
          const userPDA = deriveUserPDA(authority, subAccountId);

          const cancelIx = buildCancelOrderInstruction({
            orderId: triggerOrder.onChainOrderId,
            userPDA,
            authority,
          });

          const connection = await createConnection(rpcUrl);
          const computeIxs = await createComputeBudgetInstructions(300_000, priorityFee);

          const { transaction } = await buildVersionedTransaction(
            connection,
            authority,
            [...computeIxs, cancelIx]
          );

          const simResult = await simulateTransaction(connection, transaction);
          if (!simResult.success) {
            throw new Error(`Simulation failed: ${simResult.error}`);
          }

          const base64Tx = serializeTransactionBase64(transaction);

          const signature = await withBlockhashRetry(async () => {
            return await walletActions.sendTransaction(base64Tx as never, "confirmed");
          }, connection);

          removeTriggerOrder(orderId);

          return {
            success: true,
            signature: signature as string,
            timestamp: Date.now(),
          };
        }

        removeTriggerOrder(orderId);
        return {
          success: true,
          timestamp: Date.now(),
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to cancel trigger order";
        setError(message);
        console.error("Drift cancelTriggerOrder error:", err);
        return {
          success: false,
          error: message,
          timestamp: Date.now(),
        };
      } finally {
        setIsLoading(false);
      }
    },
    [
      isDevMode,
      triggerOrders,
      removeTriggerOrder,
      isConnected,
      walletAddress,
      clientState.isInitialized,
      subAccountId,
      rpcUrl,
      priorityFee,
      walletActions,
    ]
  );

  const getDepositInstruction = useCallback(
    async (
      amount: bigint,
      mint: string
    ): Promise<import("@solana/web3.js").TransactionInstruction | null> => {
      if (isDevMode || isDemoMode || !isConnected || !walletAddress) {
        return null;
      }

      try {
        const authority = await toPublicKey(walletAddress);
        const userPDA = deriveUserPDA(authority, subAccountId);

        const { getAssociatedTokenAddressSync } = await import(
          "@solana/spl-token"
        );
        const usdcMint = await toPublicKey(
          "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
        );
        const tokenAccount = getAssociatedTokenAddressSync(usdcMint, authority);

        return buildDepositInstruction({
          amount: new BN(amount.toString()),
          spotMarketIndex: USDC_SPOT_MARKET_INDEX,
          userPDA,
          authority,
          tokenAccount,
        });
      } catch (err) {
        console.error("Failed to build deposit instruction:", err);
        return null;
      }
    },
    [isDevMode, isConnected, walletAddress, subAccountId]
  );

  const getWithdrawInstruction = useCallback(
    async (
      amount: bigint,
      mint: string
    ): Promise<import("@solana/web3.js").TransactionInstruction | null> => {
      if (isDevMode || !isConnected || !walletAddress) {
        return null;
      }

      try {
        const authority = await toPublicKey(walletAddress);
        const userPDA = deriveUserPDA(authority, subAccountId);

        const { getAssociatedTokenAddressSync } = await import(
          "@solana/spl-token"
        );
        const usdcMint = await toPublicKey(
          "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
        );
        const tokenAccount = getAssociatedTokenAddressSync(usdcMint, authority);

        return buildWithdrawInstruction({
          amount: new BN(amount.toString()),
          spotMarketIndex: USDC_SPOT_MARKET_INDEX,
          userPDA,
          authority,
          tokenAccount,
        });
      } catch (err) {
        console.error("Failed to build withdraw instruction:", err);
        return null;
      }
    },
    [isDevMode, isConnected, walletAddress, subAccountId]
  );

  const getOpenPositionInstruction = useCallback(
    async (
      params: OpenPositionParamsSimplified
    ): Promise<import("@solana/web3.js").TransactionInstruction | null> => {
      if (isDevMode || !isConnected || !walletAddress) {
        return null;
      }

      try {
        const marketIndex = TOKEN_TO_MARKET_INDEX[params.token];
        if (marketIndex === undefined) {
          throw new Error(`Unsupported token: ${params.token}`);
        }

        const marketPrice = getPrice(params.token) || MOCK_PRICES[params.token];
        if (!marketPrice) {
          throw new Error(`No price available for ${params.token}`);
        }

        const sizeUsd = params.collateralAmount * params.leverage;
        const baseAssetAmount = new BN(
          Math.floor((sizeUsd / marketPrice) * DRIFT_PRECISION.BASE)
        );

        const authority = await toPublicKey(walletAddress);
        const userPDA = deriveUserPDA(authority, subAccountId);

        const limitPriceBN = params.limitPrice
          ? new BN(Math.floor(params.limitPrice * DRIFT_PRECISION.PRICE))
          : undefined;

        return buildOpenPerpPositionInstruction({
          marketIndex,
          baseAssetAmount,
          direction: params.side,
          userPDA,
          authority,
          orderType: params.limitPrice ? "limit" : "market",
          price: limitPriceBN,
          reduceOnly: params.reduceOnly ?? false,
          postOnly: params.postOnly ?? false,
          immediateOrCancel: params.immediateOrCancel ?? false,
        });
      } catch (err) {
        console.error("Failed to build open position instruction:", err);
        return null;
      }
    },
    [isDevMode, isConnected, walletAddress, getPrice, subAccountId]
  );

  const getClosePositionInstruction = useCallback(
    async (
      params: ClosePositionParamsSimplified
    ): Promise<import("@solana/web3.js").TransactionInstruction | null> => {
      if (isDevMode || !isConnected || !walletAddress) {
        return null;
      }

      try {
        const marketIndex = TOKEN_TO_MARKET_INDEX[params.token];
        if (marketIndex === undefined) {
          throw new Error(`Unsupported token: ${params.token}`);
        }

        const authority = await toPublicKey(walletAddress);
        const userPDA = deriveUserPDA(authority, subAccountId);

        const closingPosition = positions.find((p) => p.id === params.positionId);
        const percentage = params.percentage || 100;
        let baseAssetAmount: BN | undefined;

        if (closingPosition && percentage < 100) {
          const partialSize =
            (Number(closingPosition.baseAssetAmount) * percentage) / 100;
          baseAssetAmount = new BN(Math.floor(partialSize));
        }

        return buildClosePerpPositionInstruction({
          marketIndex,
          userPDA,
          authority,
          baseAssetAmount,
        });
      } catch (err) {
        console.error("Failed to build close position instruction:", err);
        return null;
      }
    },
    [isDevMode, isConnected, walletAddress, positions, subAccountId]
  );

  return {
    isInitialized,
    isUserAccountInitialized: clientState.isUserAccountInitialized,
    isCheckingInit: clientState.isCheckingInit,
    isLoading,
    error: error || clientState.error,
    positions,
    freeCollateral,

    triggerOrders,
    getTriggerOrdersForPosition,

    initialize,
    initializeUser,
    deposit,
    withdraw,
    openPosition,
    closePosition,

    placeTriggerOrder,
    cancelTriggerOrder,

    getDepositInstruction,
    getWithdrawInstruction,
    getOpenPositionInstruction,
    getClosePositionInstruction,
  };
}
