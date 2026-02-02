"use client";

import { getCluster } from "./solana-adapter";

export interface PriorityFeeEstimate {
  priorityFeeEstimate: number;
  priorityFeeLevels?: {
    min: number;
    low: number;
    medium: number;
    high: number;
    veryHigh: number;
    unsafeMax?: number;
  };
}

export interface PriorityFeeOptions {
  accountKeys?: string[];
  transaction?: string;
  includeAllPriorityFeeLevels?: boolean;
  recommended?: boolean;
}

const FALLBACK_PRIORITY_FEE = 50000;

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  lastFailure: number;
  openUntil: number;
}

const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_RESET_TIMEOUT_MS = 60_000;
const RATE_LIMIT_BACKOFF_MS = 30_000;

const circuitBreaker: CircuitBreakerState = {
  state: "CLOSED",
  failures: 0,
  lastFailure: 0,
  openUntil: 0,
};

function shouldSkipHelius(): boolean {
  const now = Date.now();

  if (circuitBreaker.state === "OPEN") {
    if (now >= circuitBreaker.openUntil) {
      circuitBreaker.state = "HALF_OPEN";
      return false;
    }
    return true;
  }

  return false;
}

function recordSuccess(): void {
  circuitBreaker.state = "CLOSED";
  circuitBreaker.failures = 0;
}

function recordFailure(isRateLimit: boolean): void {
  const now = Date.now();
  circuitBreaker.failures += 1;
  circuitBreaker.lastFailure = now;

  if (isRateLimit) {
    circuitBreaker.state = "OPEN";
    circuitBreaker.openUntil = now + RATE_LIMIT_BACKOFF_MS;
    console.warn(
      `[Helius] Rate limited, circuit open for ${RATE_LIMIT_BACKOFF_MS / 1000}s`
    );
  } else if (circuitBreaker.failures >= CIRCUIT_FAILURE_THRESHOLD) {
    circuitBreaker.state = "OPEN";
    circuitBreaker.openUntil = now + CIRCUIT_RESET_TIMEOUT_MS;
    console.warn(
      `[Helius] Circuit open after ${circuitBreaker.failures} failures`
    );
  }
}

export function getCircuitState(): CircuitState {
  return circuitBreaker.state;
}

export function resetCircuit(): void {
  circuitBreaker.state = "CLOSED";
  circuitBreaker.failures = 0;
  circuitBreaker.lastFailure = 0;
  circuitBreaker.openUntil = 0;
}

export function isHeliusDemoMode(): boolean {
  return !process.env.NEXT_PUBLIC_HELIUS_API_KEY;
}

function getHeliusRpcUrl(): string | null {
  const apiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY;
  if (!apiKey) {
    return null;
  }

  const cluster = getCluster();
  const base =
    cluster === "mainnet-beta"
      ? "https://mainnet.helius-rpc.com"
      : "https://devnet.helius-rpc.com";

  return `${base}?api-key=${apiKey}`;
}

function getHeliusApiUrl(): string | null {
  const apiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY;
  if (!apiKey) {
    return null;
  }

  const cluster = getCluster();
  const base =
    cluster === "mainnet-beta"
      ? "https://api-mainnet.helius-rpc.com"
      : "https://api-devnet.helius-rpc.com";

  return `${base}/v0`;
}

export async function getPriorityFeeEstimate(
  options: PriorityFeeOptions
): Promise<PriorityFeeEstimate> {
  if (shouldSkipHelius()) {
    console.debug("[Helius] Circuit open, using fallback");
    return { priorityFeeEstimate: FALLBACK_PRIORITY_FEE };
  }

  const url = getHeliusRpcUrl();
  if (!url) {
    console.debug("[Helius] Demo mode - no API key, using fallback priority fee");
    return { priorityFeeEstimate: FALLBACK_PRIORITY_FEE };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        method: "getPriorityFeeEstimate",
        params: [
          {
            accountKeys: options.accountKeys,
            transaction: options.transaction,
            options: {
              includeAllPriorityFeeLevels:
                options.includeAllPriorityFeeLevels ?? true,
              recommended: options.recommended ?? true,
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      const isRateLimit = response.status === 429;
      recordFailure(isRateLimit);
      console.warn(
        `[Helius] Priority fee API returned ${response.status}, using fallback`
      );
      return { priorityFeeEstimate: FALLBACK_PRIORITY_FEE };
    }

    const data = await response.json();

    if (data.error) {
      recordFailure(false);
      console.warn("[Helius] Priority fee API error:", data.error);
      return { priorityFeeEstimate: FALLBACK_PRIORITY_FEE };
    }

    recordSuccess();
    return {
      priorityFeeEstimate: data.result?.priorityFeeEstimate ?? FALLBACK_PRIORITY_FEE,
      priorityFeeLevels: data.result?.priorityFeeLevels,
    };
  } catch (err) {
    recordFailure(false);
    console.warn("[Helius] Failed to get priority fee estimate:", err);
    return { priorityFeeEstimate: FALLBACK_PRIORITY_FEE };
  }
}

export function hasHeliusApiKey(): boolean {
  return !!process.env.NEXT_PUBLIC_HELIUS_API_KEY;
}

export type TransactionType =
  | "ANY"
  | "SWAP"
  | "TRANSFER"
  | "NFT_SALE"
  | "NFT_MINT"
  | "COMPRESSED_NFT_MINT"
  | "COMPRESSED_NFT_TRANSFER";

export interface EnhancedTransaction {
  signature: string;
  type: string;
  timestamp: number;
  description: string;
  fee: number;
  feePayer?: string;
  slot?: number;
  nativeTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }>;
  tokenTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    mint: string;
    amount: number;
    tokenStandard?: string;
  }>;
  events?: {
    swap?: {
      tokenInputs: Array<{ mint: string; amount: string }>;
      tokenOutputs: Array<{ mint: string; amount: string }>;
      nativeInput?: { amount: string };
      nativeOutput?: { amount: string };
    };
    compressed?: {
      type: string;
      treeId: string;
      assetId: string;
      leafIndex: number;
      newLeafOwner?: string;
    };
  };
}

export interface TransactionHistoryOptions {
  address: string;
  type?: TransactionType;
  limit?: number;
  before?: string;
}

export async function getTransactionHistory(
  options: TransactionHistoryOptions
): Promise<EnhancedTransaction[]> {
  if (shouldSkipHelius()) {
    console.debug("[Helius] Circuit open, skipping transaction history fetch");
    return [];
  }

  try {
    const apiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY;
    if (!apiKey) {
      console.warn("[Helius] No API key, skipping transaction history fetch");
      return [];
    }

    const baseUrl = getHeliusApiUrl();
    const params = new URLSearchParams();
    params.set("api-key", apiKey);

    if (options.type && options.type !== "ANY") {
      params.set("type", options.type);
    }
    if (options.limit) {
      params.set("limit", options.limit.toString());
    }
    if (options.before) {
      params.set("before", options.before);
    }

    const url = `${baseUrl}/addresses/${options.address}/transactions?${params}`;

    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const isRateLimit = response.status === 429;
      recordFailure(isRateLimit);
      console.warn(
        `[Helius] Transaction history API returned ${response.status}`
      );
      return [];
    }

    recordSuccess();
    const transactions = await response.json();
    return Array.isArray(transactions) ? transactions : [];
  } catch (err) {
    recordFailure(false);
    console.warn("[Helius] Failed to fetch transaction history:", err);
    return [];
  }
}

export { getHeliusApiUrl };
