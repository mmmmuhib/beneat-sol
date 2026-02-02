"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  useWalletConnection,
  useSendTransaction,
  useBalance,
} from "@solana/react-hooks";
import {
  getProgramDerivedAddress,
  getAddressEncoder,
  getBytesEncoder,
  fetchEncodedAccount,
  type Address,
} from "@solana/kit";
import { createSolanaRpcClient } from "@solana/client";
import {
  getInitializeInstructionDataEncoder,
  getDepositInstructionDataEncoder,
  getWithdrawInstructionDataEncoder,
  getSetRulesInstructionDataEncoder,
  getManualLockInstructionDataEncoder,
  getUnlockInstructionDataEncoder,
  getSwapWithEnforcementInstructionDataEncoder,
  VAULT_PROGRAM_ADDRESS,
} from "../generated/vault";
import { decodeVault, type Vault } from "../generated/vault/accounts";
import { useDevMode } from "./use-dev-mode";
import { useDemoMode } from "./use-demo-mode";

const SYSTEM_PROGRAM_ADDRESS = "11111111111111111111111111111111" as Address;
const RPC_ENDPOINT = "https://api.devnet.solana.com";

const MOCK_VAULT: Vault = {
  discriminator: new Uint8Array([0]),
  owner: "DevMock1111111111111111111111111111111" as Address,
  bump: 255,
  isLocked: false,
  lockoutUntil: 0n,
  lockoutCount: 2,
  lockoutDuration: 3600,
  dailyLossLimit: 500_000_000n,
  maxTradesPerDay: 10,
  tradesToday: 3,
  sessionStart: BigInt(Math.floor(Date.now() / 1000) - 3600),
  totalDeposited: 5_000_000_000n,
  totalWithdrawn: 1_500_000_000n,
  lastTradeWasLoss: true,
  lastTradeTime: BigInt(Math.floor(Date.now() / 1000) - 300),
  cooldownSeconds: 60,
};

const DEMO_VAULT_KEY = "beneat-demo-vault-created";

export interface TradeValidationResult {
  allowed: boolean;
  reason?: string;
}

export interface UseVaultReturn {
  vault: Vault | null;
  vaultAddress: Address | null;
  isLoading: boolean;
  error: string | null;

  isLocked: boolean;
  lockoutRemaining: number;
  balance: bigint;
  isInCooldown: boolean;
  cooldownRemaining: number;

  dailyLossLimit: bigint;
  maxTradesPerDay: number;
  tradesToday: number;
  totalDeposited: bigint;
  totalWithdrawn: bigint;
  lockoutCount: number;

  initializeVault: (lockoutDuration: number) => Promise<string | null>;
  deposit: (amount: bigint) => Promise<string | null>;
  withdraw: (amount: bigint) => Promise<string | null>;
  setRules: (
    dailyLossLimit: bigint,
    maxTrades: number,
    lockoutDuration: number
  ) => Promise<string | null>;
  manualLock: () => Promise<string | null>;
  unlock: () => Promise<string | null>;
  executeSwap: (amountIn: bigint, minOut: bigint) => Promise<string | null>;
  refresh: () => Promise<void>;
  canTrade: () => TradeValidationResult;
  recordTrade: (wasLoss: boolean) => void;

  isSending: boolean;
  isDemoInitialized: boolean;
}

function useDemoVault(): UseVaultReturn {
  const [isDemoInitialized, setIsDemoInitialized] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(DEMO_VAULT_KEY) === "true";
  });
  const [isSending, setIsSending] = useState(false);
  const [demoVault, setDemoVault] = useState<Vault | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = localStorage.getItem(DEMO_VAULT_KEY);
    return saved === "true" ? MOCK_VAULT : null;
  });
  const [currentTime, setCurrentTime] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const mockCurrentTime = Math.floor(Date.now() / 1000);
  const mockLastTradeTime = Number(MOCK_VAULT.lastTradeTime);
  const mockCooldownEnd = mockLastTradeTime + MOCK_VAULT.cooldownSeconds;
  const mockIsInCooldown = MOCK_VAULT.lastTradeWasLoss && mockCooldownEnd > mockCurrentTime;
  const mockCooldownRemaining = mockIsInCooldown ? mockCooldownEnd - mockCurrentTime : 0;

  const canTrade = useCallback((): TradeValidationResult => {
    const vault = demoVault || MOCK_VAULT;
    if (vault.isLocked) {
      return { allowed: false, reason: "Vault is locked" };
    }
    if (vault.tradesToday >= vault.maxTradesPerDay) {
      return { allowed: false, reason: `Daily trade limit reached (${vault.maxTradesPerDay} trades)` };
    }
    if (mockIsInCooldown) {
      return { allowed: false, reason: `Cooldown active after loss (${mockCooldownRemaining}s remaining)` };
    }
    return { allowed: true };
  }, [demoVault, mockIsInCooldown, mockCooldownRemaining]);

  const recordTrade = useCallback((wasLoss: boolean) => {
    setDemoVault((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tradesToday: prev.tradesToday + 1,
        lastTradeWasLoss: wasLoss,
        lastTradeTime: BigInt(Math.floor(Date.now() / 1000)),
      };
    });
  }, []);

  const simulateTransaction = async (): Promise<string> => {
    setIsSending(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsSending(false);
    const sig = "demo-" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    return sig;
  };

  const initializeVault = useCallback(async (lockoutDuration: number): Promise<string | null> => {
    const sig = await simulateTransaction();
    const newVault: Vault = {
      ...MOCK_VAULT,
      lockoutDuration,
      tradesToday: 0,
      lockoutCount: 0,
      totalDeposited: 0n,
      totalWithdrawn: 0n,
    };
    setDemoVault(newVault);
    setIsDemoInitialized(true);
    if (typeof window !== "undefined") {
      localStorage.setItem(DEMO_VAULT_KEY, "true");
    }
    return sig;
  }, []);

  const setRules = useCallback(async (
    dailyLossLimitArg: bigint,
    maxTrades: number,
    lockoutDuration: number
  ): Promise<string | null> => {
    const sig = await simulateTransaction();
    setDemoVault((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        dailyLossLimit: dailyLossLimitArg,
        maxTradesPerDay: maxTrades,
        lockoutDuration,
      };
    });
    return sig;
  }, []);

  const deposit = useCallback(async (amount: bigint): Promise<string | null> => {
    const sig = await simulateTransaction();
    setDemoVault((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        totalDeposited: prev.totalDeposited + amount,
      };
    });
    return sig;
  }, []);

  const withdraw = useCallback(async (amount: bigint): Promise<string | null> => {
    const sig = await simulateTransaction();
    setDemoVault((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        totalWithdrawn: prev.totalWithdrawn + amount,
      };
    });
    return sig;
  }, []);

  const manualLock = useCallback(async (): Promise<string | null> => {
    const sig = await simulateTransaction();
    setDemoVault((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        isLocked: true,
        lockoutUntil: BigInt(Math.floor(Date.now() / 1000) + prev.lockoutDuration),
        lockoutCount: prev.lockoutCount + 1,
      };
    });
    return sig;
  }, []);

  const unlock = useCallback(async (): Promise<string | null> => {
    const sig = await simulateTransaction();
    setDemoVault((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        isLocked: false,
        lockoutUntil: 0n,
      };
    });
    return sig;
  }, []);

  const executeSwap = useCallback(async (): Promise<string | null> => {
    return simulateTransaction();
  }, []);

  const refresh = useCallback(async () => {
  }, []);

  const vault = demoVault;
  const isLocked = vault?.isLocked ?? false;
  const lockoutRemaining = useMemo(() => {
    if (!vault || !vault.isLocked) return 0;
    const remaining = Number(vault.lockoutUntil) - currentTime;
    return remaining > 0 ? remaining : 0;
  }, [vault, currentTime]);

  const balance = useMemo(() => {
    if (!vault) return 0n;
    return vault.totalDeposited - vault.totalWithdrawn;
  }, [vault]);

  return {
    vault,
    vaultAddress: "DevMockVault11111111111111111111111" as Address,
    isLoading: false,
    error: null,
    isLocked,
    lockoutRemaining,
    balance: balance > 0n ? balance : 3_500_000_000n,
    isInCooldown: mockIsInCooldown,
    cooldownRemaining: mockCooldownRemaining,
    dailyLossLimit: vault?.dailyLossLimit ?? MOCK_VAULT.dailyLossLimit,
    maxTradesPerDay: vault?.maxTradesPerDay ?? MOCK_VAULT.maxTradesPerDay,
    tradesToday: vault?.tradesToday ?? 0,
    totalDeposited: vault?.totalDeposited ?? 0n,
    totalWithdrawn: vault?.totalWithdrawn ?? 0n,
    lockoutCount: vault?.lockoutCount ?? 0,
    initializeVault,
    deposit,
    withdraw,
    setRules,
    manualLock,
    unlock,
    executeSwap,
    refresh,
    canTrade,
    recordTrade,
    isSending,
    isDemoInitialized,
  };
}

export function useVault(): UseVaultReturn {
  const { isDevMode } = useDevMode();
  const { isDemoMode } = useDemoMode();
  const { wallet, status } = useWalletConnection();
  const { send, isSending } = useSendTransaction();

  const demoVault = useDemoVault();

  const isMockMode = isDevMode || isDemoMode;

  const [vault, setVault] = useState<Vault | null>(null);
  const [vaultAddress, setVaultAddress] = useState<Address | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() =>
    Math.floor(Date.now() / 1000)
  );

  const walletAddress = wallet?.account.address;

  useEffect(() => {
    async function deriveVaultPda() {
      if (!walletAddress) {
        setVaultAddress(null);
        setVault(null);
        return;
      }

      try {
        const [pda] = await getProgramDerivedAddress({
          programAddress: VAULT_PROGRAM_ADDRESS,
          seeds: [
            getBytesEncoder().encode(new Uint8Array([118, 97, 117, 108, 116])),
            getAddressEncoder().encode(walletAddress),
          ],
        });
        setVaultAddress(pda);
      } catch (err) {
        console.error("Failed to derive vault PDA:", err);
        setError("Failed to derive vault address");
      }
    }

    deriveVaultPda();
  }, [walletAddress]);

  const fetchVaultAccount = useCallback(async () => {
    if (!vaultAddress) {
      setVault(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const client = createSolanaRpcClient({ endpoint: RPC_ENDPOINT });
      const encodedAccount = await fetchEncodedAccount(
        client.rpc,
        vaultAddress
      );

      if (!encodedAccount.exists) {
        setVault(null);
        return;
      }

      const decodedVault = decodeVault(encodedAccount);
      setVault((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(decodedVault.data)) {
          return prev;
        }
        return decodedVault.data;
      });
    } catch (err) {
      console.error("Failed to fetch vault account:", err);
      setError("Failed to fetch vault data");
      setVault(null);
    } finally {
      setIsLoading(false);
    }
  }, [vaultAddress]);

  useEffect(() => {
    fetchVaultAccount();
  }, [fetchVaultAccount]);

  useEffect(() => {
    const needsTimer = vault?.isLocked || (vault?.lastTradeWasLoss && vault?.cooldownSeconds > 0);
    if (!needsTimer) return;

    const interval = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [vault?.isLocked, vault?.lastTradeWasLoss, vault?.cooldownSeconds]);

  const vaultBalance = useBalance(vaultAddress ?? undefined);

  const isLocked = useMemo(() => {
    if (!vault) return false;
    if (!vault.isLocked) return false;
    return Number(vault.lockoutUntil) > currentTime;
  }, [vault, currentTime]);

  const lockoutRemaining = useMemo(() => {
    if (!vault || !vault.isLocked) return 0;
    const remaining = Number(vault.lockoutUntil) - currentTime;
    return remaining > 0 ? remaining : 0;
  }, [vault, currentTime]);

  const balance = useMemo(() => {
    return vaultBalance?.lamports ?? 0n;
  }, [vaultBalance]);

  const isInCooldown = useMemo(() => {
    if (!vault) return false;
    if (!vault.lastTradeWasLoss) return false;
    if (vault.cooldownSeconds === 0) return false;
    const cooldownEnd = Number(vault.lastTradeTime) + vault.cooldownSeconds;
    return cooldownEnd > currentTime;
  }, [vault, currentTime]);

  const cooldownRemaining = useMemo(() => {
    if (!vault || !vault.lastTradeWasLoss) return 0;
    const cooldownEnd = Number(vault.lastTradeTime) + vault.cooldownSeconds;
    const remaining = cooldownEnd - currentTime;
    return remaining > 0 ? remaining : 0;
  }, [vault, currentTime]);

  const canTrade = useCallback((): TradeValidationResult => {
    if (!vault) {
      return { allowed: false, reason: "Vault not initialized" };
    }
    if (isLocked) {
      return { allowed: false, reason: "Vault is locked" };
    }
    if (lockoutRemaining > 0) {
      return { allowed: false, reason: `Lockout active (${lockoutRemaining}s remaining)` };
    }
    if (vault.tradesToday >= vault.maxTradesPerDay) {
      return { allowed: false, reason: `Daily trade limit reached (${vault.maxTradesPerDay} trades)` };
    }
    if (isInCooldown) {
      return { allowed: false, reason: `Cooldown active after loss (${cooldownRemaining}s remaining)` };
    }
    return { allowed: true };
  }, [vault, isLocked, lockoutRemaining, isInCooldown, cooldownRemaining]);

  const recordTrade = useCallback((wasLoss: boolean) => {
    if (!vault) return;
    setVault((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tradesToday: prev.tradesToday + 1,
        lastTradeWasLoss: wasLoss,
        lastTradeTime: BigInt(Math.floor(Date.now() / 1000)),
      };
    });
  }, [vault]);

  const dailyLossLimit = vault?.dailyLossLimit ?? 0n;
  const maxTradesPerDay = vault?.maxTradesPerDay ?? 0;
  const tradesToday = vault?.tradesToday ?? 0;
  const totalDeposited = vault?.totalDeposited ?? 0n;
  const totalWithdrawn = vault?.totalWithdrawn ?? 0n;
  const lockoutCount = vault?.lockoutCount ?? 0;

  const initializeVault = useCallback(
    async (lockoutDuration: number): Promise<string | null> => {
      if (isMockMode) {
        return demoVault.initializeVault(lockoutDuration);
      }

      if (!walletAddress || !vaultAddress) {
        setError("Wallet not connected");
        return null;
      }

      try {
        setError(null);

        const instruction = {
          programAddress: VAULT_PROGRAM_ADDRESS,
          accounts: [
            { address: walletAddress, role: 3 },
            { address: vaultAddress, role: 1 },
            { address: SYSTEM_PROGRAM_ADDRESS, role: 0 },
          ],
          data: getInitializeInstructionDataEncoder().encode({
            lockoutDuration,
          }),
        };

        const signature = await send({ instructions: [instruction] });

        await fetchVaultAccount();

        return signature ?? null;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Initialize failed";
        setError(message);
        console.error("Initialize vault failed:", err);
        return null;
      }
    },
    [isMockMode, demoVault, walletAddress, vaultAddress, send, fetchVaultAccount]
  );

  const deposit = useCallback(
    async (amount: bigint): Promise<string | null> => {
      if (isMockMode) {
        return demoVault.deposit(amount);
      }

      if (!walletAddress || !vaultAddress) {
        setError("Wallet not connected");
        return null;
      }

      try {
        setError(null);

        const instruction = {
          programAddress: VAULT_PROGRAM_ADDRESS,
          accounts: [
            { address: walletAddress, role: 3 },
            { address: vaultAddress, role: 1 },
            { address: SYSTEM_PROGRAM_ADDRESS, role: 0 },
          ],
          data: getDepositInstructionDataEncoder().encode({ amount }),
        };

        const signature = await send({ instructions: [instruction] });

        await fetchVaultAccount();

        return signature ?? null;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Deposit failed";
        setError(message);
        console.error("Deposit failed:", err);
        return null;
      }
    },
    [isMockMode, demoVault, walletAddress, vaultAddress, send, fetchVaultAccount]
  );

  const withdraw = useCallback(
    async (amount: bigint): Promise<string | null> => {
      if (isMockMode) {
        return demoVault.withdraw(amount);
      }

      if (!walletAddress || !vaultAddress) {
        setError("Wallet not connected");
        return null;
      }

      try {
        setError(null);

        const instruction = {
          programAddress: VAULT_PROGRAM_ADDRESS,
          accounts: [
            { address: walletAddress, role: 3 },
            { address: vaultAddress, role: 1 },
            { address: SYSTEM_PROGRAM_ADDRESS, role: 0 },
          ],
          data: getWithdrawInstructionDataEncoder().encode({ amount }),
        };

        const signature = await send({ instructions: [instruction] });

        await fetchVaultAccount();

        return signature ?? null;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Withdraw failed";
        setError(message);
        console.error("Withdraw failed:", err);
        return null;
      }
    },
    [isMockMode, demoVault, walletAddress, vaultAddress, send, fetchVaultAccount]
  );

  const setRules = useCallback(
    async (
      dailyLossLimitArg: bigint,
      maxTrades: number,
      lockoutDuration: number
    ): Promise<string | null> => {
      if (isMockMode) {
        return demoVault.setRules(dailyLossLimitArg, maxTrades, lockoutDuration);
      }

      if (!walletAddress || !vaultAddress) {
        setError("Wallet not connected");
        return null;
      }

      try {
        setError(null);

        const instruction = {
          programAddress: VAULT_PROGRAM_ADDRESS,
          accounts: [
            { address: walletAddress, role: 2 },
            { address: vaultAddress, role: 1 },
          ],
          data: getSetRulesInstructionDataEncoder().encode({
            dailyLossLimit: dailyLossLimitArg,
            maxTradesPerDay: maxTrades,
            lockoutDuration,
          }),
        };

        const signature = await send({ instructions: [instruction] });

        await fetchVaultAccount();

        return signature ?? null;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Set rules failed";
        setError(message);
        console.error("Set rules failed:", err);
        return null;
      }
    },
    [isMockMode, demoVault, walletAddress, vaultAddress, send, fetchVaultAccount]
  );

  const manualLock = useCallback(async (): Promise<string | null> => {
    if (isMockMode) {
      return demoVault.manualLock();
    }

    if (!walletAddress || !vaultAddress) {
      setError("Wallet not connected");
      return null;
    }

    try {
      setError(null);

      const instruction = {
        programAddress: VAULT_PROGRAM_ADDRESS,
        accounts: [
          { address: walletAddress, role: 2 },
          { address: vaultAddress, role: 1 },
        ],
        data: getManualLockInstructionDataEncoder().encode({}),
      };

      const signature = await send({ instructions: [instruction] });

      await fetchVaultAccount();

      return signature ?? null;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Manual lock failed";
      setError(message);
      console.error("Manual lock failed:", err);
      return null;
    }
  }, [isMockMode, demoVault, walletAddress, vaultAddress, send, fetchVaultAccount]);

  const unlock = useCallback(async (): Promise<string | null> => {
    if (isMockMode) {
      return demoVault.unlock();
    }

    if (!walletAddress || !vaultAddress) {
      setError("Wallet not connected");
      return null;
    }

    try {
      setError(null);

      const instruction = {
        programAddress: VAULT_PROGRAM_ADDRESS,
        accounts: [
          { address: walletAddress, role: 2 },
          { address: vaultAddress, role: 1 },
        ],
        data: getUnlockInstructionDataEncoder().encode({}),
      };

      const signature = await send({ instructions: [instruction] });

      await fetchVaultAccount();

      return signature ?? null;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unlock failed";
      setError(message);
      console.error("Unlock failed:", err);
      return null;
    }
  }, [isMockMode, demoVault, walletAddress, vaultAddress, send, fetchVaultAccount]);

  const executeSwap = useCallback(
    async (amountIn: bigint, minOut: bigint): Promise<string | null> => {
      if (isMockMode) {
        return demoVault.executeSwap(amountIn, minOut);
      }

      if (!walletAddress || !vaultAddress) {
        setError("Wallet not connected");
        return null;
      }

      try {
        setError(null);

        const instruction = {
          programAddress: VAULT_PROGRAM_ADDRESS,
          accounts: [
            { address: walletAddress, role: 3 },
            { address: vaultAddress, role: 1 },
          ],
          data: getSwapWithEnforcementInstructionDataEncoder().encode({
            amountIn,
            minOut,
          }),
        };

        const signature = await send({ instructions: [instruction] });

        await fetchVaultAccount();

        return signature ?? null;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Swap failed";
        setError(message);
        console.error("Swap failed:", err);
        return null;
      }
    },
    [isMockMode, demoVault, walletAddress, vaultAddress, send, fetchVaultAccount]
  );

  const refresh = useCallback(async () => {
    if (isMockMode) {
      return demoVault.refresh();
    }
    await fetchVaultAccount();
  }, [isMockMode, demoVault, fetchVaultAccount]);

  if (isMockMode) {
    return {
      vault: demoVault.vault,
      vaultAddress: demoVault.vaultAddress,
      isLoading: demoVault.isLoading,
      error: demoVault.error,
      isLocked: demoVault.isLocked,
      lockoutRemaining: demoVault.lockoutRemaining,
      balance: demoVault.balance,
      isInCooldown: demoVault.isInCooldown,
      cooldownRemaining: demoVault.cooldownRemaining,
      dailyLossLimit: demoVault.dailyLossLimit,
      maxTradesPerDay: demoVault.maxTradesPerDay,
      tradesToday: demoVault.tradesToday,
      totalDeposited: demoVault.totalDeposited,
      totalWithdrawn: demoVault.totalWithdrawn,
      lockoutCount: demoVault.lockoutCount,
      initializeVault,
      deposit,
      withdraw,
      setRules,
      manualLock,
      unlock,
      executeSwap,
      refresh,
      canTrade: demoVault.canTrade,
      recordTrade: demoVault.recordTrade,
      isSending: demoVault.isSending,
      isDemoInitialized: demoVault.isDemoInitialized,
    };
  }

  return {
    vault,
    vaultAddress,
    isLoading,
    error,
    isLocked,
    lockoutRemaining,
    balance,
    isInCooldown,
    cooldownRemaining,
    dailyLossLimit,
    maxTradesPerDay,
    tradesToday,
    totalDeposited,
    totalWithdrawn,
    lockoutCount,
    initializeVault,
    deposit,
    withdraw,
    setRules,
    manualLock,
    unlock,
    executeSwap,
    refresh,
    canTrade,
    recordTrade,
    isSending,
    isDemoInitialized: false,
  };
}
