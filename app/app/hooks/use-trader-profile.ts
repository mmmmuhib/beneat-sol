"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  useWalletConnection,
  useSendTransaction,
} from "@solana/react-hooks";
import {
  getProgramDerivedAddress,
  getAddressEncoder,
  getBytesEncoder,
  fetchEncodedAccount,
  getStructDecoder,
  getStructEncoder,
  getU8Decoder,
  getU8Encoder,
  getU16Decoder,
  getU16Encoder,
  getU32Decoder,
  getU32Encoder,
  getU64Decoder,
  getU64Encoder,
  getI64Decoder,
  getI64Encoder,
  getAddressDecoder,
  fixDecoderSize,
  fixEncoderSize,
  getBytesDecoder,
  combineCodec,
  transformEncoder,
  type Address,
  type ReadonlyUint8Array,
} from "@solana/kit";
import { createSolanaRpcClient } from "@solana/client";
import { VAULT_PROGRAM_ADDRESS } from "../generated/vault";
import {
  useGamificationStore,
  type OnChainTraderProfile,
} from "../stores/gamification-store";
import { useDevMode } from "./use-dev-mode";
import { useDemoMode } from "./use-demo-mode";
import { type Tier } from "../lib/mock-analysis";

const SYSTEM_PROGRAM_ADDRESS = "11111111111111111111111111111111" as Address;
const RPC_ENDPOINT = "https://api.devnet.solana.com";

const TRADER_PROFILE_SEED = new Uint8Array([
  116, 114, 97, 100, 101, 114, 95, 112, 114, 111, 102, 105, 108, 101,
]); // "trader_profile"

const INITIALIZE_PROFILE_DISCRIMINATOR = new Uint8Array([
  255, 191, 48, 155, 48, 219, 72, 44,
]);

const UPDATE_STATS_DISCRIMINATOR = new Uint8Array([
  61, 55, 227, 230, 46, 189, 149, 167,
]);

export type TraderProfile = {
  discriminator: ReadonlyUint8Array;
  authority: Address;
  bump: number;
  overallRating: number;
  discipline: number;
  patience: number;
  consistency: number;
  timing: number;
  riskControl: number;
  endurance: number;
  totalTrades: number;
  totalWins: number;
  totalPnl: bigint;
  avgTradeSize: bigint;
  tradingDays: number;
  lastUpdated: bigint;
};

function getTraderProfileDecoder() {
  return getStructDecoder([
    ["discriminator", fixDecoderSize(getBytesDecoder(), 8)],
    ["authority", getAddressDecoder()],
    ["bump", getU8Decoder()],
    ["overallRating", getU8Decoder()],
    ["discipline", getU8Decoder()],
    ["patience", getU8Decoder()],
    ["consistency", getU8Decoder()],
    ["timing", getU8Decoder()],
    ["riskControl", getU8Decoder()],
    ["endurance", getU8Decoder()],
    ["totalTrades", getU32Decoder()],
    ["totalWins", getU32Decoder()],
    ["totalPnl", getI64Decoder()],
    ["avgTradeSize", getU64Decoder()],
    ["tradingDays", getU16Decoder()],
    ["lastUpdated", getI64Decoder()],
  ]);
}

function getUpdateStatsEncoder() {
  return transformEncoder(
    getStructEncoder([
      ["discriminator", fixEncoderSize(getBytesEncoder(), 8)],
      ["overallRating", getU8Encoder()],
      ["discipline", getU8Encoder()],
      ["patience", getU8Encoder()],
      ["consistency", getU8Encoder()],
      ["timing", getU8Encoder()],
      ["riskControl", getU8Encoder()],
      ["endurance", getU8Encoder()],
      ["totalTrades", getU32Encoder()],
      ["totalWins", getU32Encoder()],
      ["totalPnl", getI64Encoder()],
      ["avgTradeSize", getU64Encoder()],
      ["tradingDays", getU16Encoder()],
    ]),
    (value: {
      overallRating: number;
      discipline: number;
      patience: number;
      consistency: number;
      timing: number;
      riskControl: number;
      endurance: number;
      totalTrades: number;
      totalWins: number;
      totalPnl: number | bigint;
      avgTradeSize: number | bigint;
      tradingDays: number;
    }) => ({ ...value, discriminator: UPDATE_STATS_DISCRIMINATOR })
  );
}

function getInitializeProfileEncoder() {
  return transformEncoder(
    getStructEncoder([
      ["discriminator", fixEncoderSize(getBytesEncoder(), 8)],
    ]),
    (_value: Record<string, never>) => ({
      discriminator: INITIALIZE_PROFILE_DISCRIMINATOR,
    })
  );
}

const MOCK_PROFILE: OnChainTraderProfile = {
  authority: "DevMock1111111111111111111111111111111",
  overallRating: 62,
  discipline: 71,
  patience: 55,
  consistency: 68,
  timing: 58,
  riskControl: 64,
  endurance: 52,
  totalTrades: 147,
  totalWins: 89,
  totalPnl: -2340,
  avgTradeSize: 450,
  tradingDays: 23,
  lastUpdated: Math.floor(Date.now() / 1000),
};

export function getTierFromRating(rating: number): Tier {
  if (rating >= 85) return "Legendary";
  if (rating >= 70) return "Diamond";
  if (rating >= 55) return "Gold";
  if (rating >= 40) return "Silver";
  return "Bronze";
}

export interface UseTraderProfileReturn {
  profile: OnChainTraderProfile | null;
  profileAddress: Address | null;
  tier: Tier;
  isLoading: boolean;
  error: string | null;
  hasProfile: boolean;

  initializeProfile: () => Promise<string | null>;
  updateStats: (stats: {
    overallRating: number;
    discipline: number;
    patience: number;
    consistency: number;
    timing: number;
    riskControl: number;
    endurance: number;
    totalTrades: number;
    totalWins: number;
    totalPnl: number | bigint;
    avgTradeSize: number | bigint;
    tradingDays: number;
  }) => Promise<string | null>;
  refresh: () => Promise<void>;

  isSending: boolean;
}

export function useTraderProfile(): UseTraderProfileReturn {
  const { isDevMode } = useDevMode();
  const { isDemoMode } = useDemoMode();
  const { wallet } = useWalletConnection();
  const { send, isSending } = useSendTransaction();
  const setProfile = useGamificationStore((s) => s.setProfile);
  const clearProfile = useGamificationStore((s) => s.clearProfile);

  if (isDevMode || isDemoMode) {
    setProfile(MOCK_PROFILE);
    return {
      profile: MOCK_PROFILE,
      profileAddress: "DevMockProfile1111111111111111111111" as Address,
      tier: getTierFromRating(MOCK_PROFILE.overallRating),
      isLoading: false,
      error: null,
      hasProfile: true,
      initializeProfile: async () => "mock-signature",
      updateStats: async () => "mock-signature",
      refresh: async () => {},
      isSending: false,
    };
  }

  const [profileData, setProfileData] = useState<TraderProfile | null>(null);
  const [profileAddress, setProfileAddress] = useState<Address | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const walletAddress = wallet?.account.address;

  useEffect(() => {
    async function deriveProfilePda() {
      if (!walletAddress) {
        setProfileAddress(null);
        setProfileData(null);
        clearProfile();
        return;
      }

      try {
        const [pda] = await getProgramDerivedAddress({
          programAddress: VAULT_PROGRAM_ADDRESS,
          seeds: [
            getBytesEncoder().encode(TRADER_PROFILE_SEED),
            getAddressEncoder().encode(walletAddress),
          ],
        });
        setProfileAddress(pda);
      } catch (err) {
        console.error("Failed to derive profile PDA:", err);
        setError("Failed to derive profile address");
      }
    }

    deriveProfilePda();
  }, [walletAddress, clearProfile]);

  const fetchProfile = useCallback(async () => {
    if (!profileAddress) {
      setProfileData(null);
      clearProfile();
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const client = createSolanaRpcClient({ endpoint: RPC_ENDPOINT });
      const encodedAccount = await fetchEncodedAccount(
        client.rpc,
        profileAddress
      );

      if (!encodedAccount.exists) {
        setProfileData(null);
        clearProfile();
        return;
      }

      const decoder = getTraderProfileDecoder();
      const decoded = decoder.decode(encodedAccount.data);

      setProfileData((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(decoded)) return prev;
        return decoded;
      });

      const storeProfile: OnChainTraderProfile = {
        authority: decoded.authority,
        overallRating: decoded.overallRating,
        discipline: decoded.discipline,
        patience: decoded.patience,
        consistency: decoded.consistency,
        timing: decoded.timing,
        riskControl: decoded.riskControl,
        endurance: decoded.endurance,
        totalTrades: decoded.totalTrades,
        totalWins: decoded.totalWins,
        totalPnl: Number(decoded.totalPnl),
        avgTradeSize: Number(decoded.avgTradeSize),
        tradingDays: decoded.tradingDays,
        lastUpdated: Number(decoded.lastUpdated),
      };
      setProfile(storeProfile);
    } catch (err) {
      console.error("Failed to fetch trader profile:", err);
      setError("Failed to fetch profile data");
      setProfileData(null);
      clearProfile();
    } finally {
      setIsLoading(false);
    }
  }, [profileAddress, setProfile, clearProfile]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const profile = useMemo((): OnChainTraderProfile | null => {
    if (!profileData) return null;
    return {
      authority: profileData.authority,
      overallRating: profileData.overallRating,
      discipline: profileData.discipline,
      patience: profileData.patience,
      consistency: profileData.consistency,
      timing: profileData.timing,
      riskControl: profileData.riskControl,
      endurance: profileData.endurance,
      totalTrades: profileData.totalTrades,
      totalWins: profileData.totalWins,
      totalPnl: Number(profileData.totalPnl),
      avgTradeSize: Number(profileData.avgTradeSize),
      tradingDays: profileData.tradingDays,
      lastUpdated: Number(profileData.lastUpdated),
    };
  }, [profileData]);

  const tier = useMemo(
    () => getTierFromRating(profile?.overallRating ?? 0),
    [profile?.overallRating]
  );

  const initializeProfile = useCallback(async (): Promise<string | null> => {
    if (!walletAddress || !profileAddress) {
      setError("Wallet not connected");
      return null;
    }

    try {
      setError(null);

      const instruction = {
        programAddress: VAULT_PROGRAM_ADDRESS,
        accounts: [
          { address: walletAddress, role: 3 },
          { address: profileAddress, role: 1 },
          { address: SYSTEM_PROGRAM_ADDRESS, role: 0 },
        ],
        data: getInitializeProfileEncoder().encode(
          {} as Record<string, never>
        ),
      };

      const signature = await send({ instructions: [instruction] });
      await fetchProfile();
      return signature ?? null;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Initialize profile failed";
      setError(message);
      console.error("Initialize profile failed:", err);
      return null;
    }
  }, [walletAddress, profileAddress, send, fetchProfile]);

  const updateStats = useCallback(
    async (stats: {
      overallRating: number;
      discipline: number;
      patience: number;
      consistency: number;
      timing: number;
      riskControl: number;
      endurance: number;
      totalTrades: number;
      totalWins: number;
      totalPnl: number | bigint;
      avgTradeSize: number | bigint;
      tradingDays: number;
    }): Promise<string | null> => {
      if (!walletAddress || !profileAddress) {
        setError("Wallet not connected");
        return null;
      }

      try {
        setError(null);

        const instruction = {
          programAddress: VAULT_PROGRAM_ADDRESS,
          accounts: [
            { address: walletAddress, role: 2 },
            { address: profileAddress, role: 1 },
          ],
          data: getUpdateStatsEncoder().encode(stats),
        };

        const signature = await send({ instructions: [instruction] });
        await fetchProfile();
        return signature ?? null;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Update stats failed";
        setError(message);
        console.error("Update stats failed:", err);
        return null;
      }
    },
    [walletAddress, profileAddress, send, fetchProfile]
  );

  const refresh = useCallback(async () => {
    await fetchProfile();
  }, [fetchProfile]);

  return {
    profile,
    profileAddress,
    tier,
    isLoading,
    error,
    hasProfile: profileData !== null,
    initializeProfile,
    updateStats,
    refresh,
    isSending,
  };
}
