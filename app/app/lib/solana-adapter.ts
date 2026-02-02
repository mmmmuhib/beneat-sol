"use client";

/**
 * Solana Adapter Boundary
 *
 * This module isolates all conversions between @solana/kit types and @solana/web3.js types.
 * All external SDK integrations (Drift, Light Protocol, Flash Trade) should use this adapter
 * rather than mixing types throughout the codebase.
 *
 * Pattern:
 * - Core app code uses Kit types (Address, etc.)
 * - When calling external SDKs that need web3.js, convert at the boundary
 * - Convert back to Kit types before returning to core code
 */

import type { Address } from "@solana/kit";

let web3Cache: typeof import("@solana/web3.js") | null = null;

async function getWeb3(): Promise<typeof import("@solana/web3.js")> {
  if (!web3Cache) {
    web3Cache = await import("@solana/web3.js");
  }
  return web3Cache;
}

/**
 * Convert a Kit Address to a web3.js PublicKey.
 * Use when passing addresses to external SDKs.
 */
export async function toPublicKey(
  address: Address | string
): Promise<import("@solana/web3.js").PublicKey> {
  const { PublicKey } = await getWeb3();
  return new PublicKey(address.toString());
}

/**
 * Convert a web3.js PublicKey to a Kit Address.
 * Use when receiving addresses from external SDKs.
 */
export function toAddress(
  publicKey: import("@solana/web3.js").PublicKey | string
): Address {
  const str = typeof publicKey === "string" ? publicKey : publicKey.toBase58();
  return str as Address;
}

/**
 * Synchronous version of toPublicKey for use when web3.js is already loaded.
 * Throws if web3.js hasn't been loaded yet.
 */
export function toPublicKeySync(
  address: Address | string
): import("@solana/web3.js").PublicKey {
  if (!web3Cache) {
    throw new Error(
      "web3.js not loaded. Call toPublicKey (async) first or ensure web3.js is imported."
    );
  }
  return new web3Cache.PublicKey(address.toString());
}

/**
 * Create a Connection instance for external SDK use.
 * Centralizes RPC endpoint configuration.
 */
export async function createConnection(
  endpoint?: string,
  commitment: import("@solana/web3.js").Commitment = "confirmed"
): Promise<import("@solana/web3.js").Connection> {
  const { Connection } = await getWeb3();
  const rpcUrl =
    endpoint ||
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    "https://api.devnet.solana.com";
  return new Connection(rpcUrl, commitment);
}

/**
 * Get the current cluster name based on environment.
 */
export function getCluster(): "mainnet-beta" | "devnet" | "localnet" {
  const rpcUrl =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
  if (rpcUrl.includes("mainnet")) return "mainnet-beta";
  if (rpcUrl.includes("localhost") || rpcUrl.includes("127.0.0.1"))
    return "localnet";
  return "devnet";
}

/**
 * Light Protocol configuration for ZK compression operations.
 */
export interface LightProtocolConfig {
  cluster: "mainnet-beta" | "devnet" | "localnet";
  rpcEndpoint: string;
  compressionRpcEndpoint: string;
  knownMints: {
    USDC: string;
    SOL: string;
  };
}

const LIGHT_KNOWN_MINTS = {
  "mainnet-beta": {
    USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    SOL: "So11111111111111111111111111111111111111112",
  },
  devnet: {
    USDC: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    SOL: "So11111111111111111111111111111111111111112",
  },
  localnet: {
    USDC: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    SOL: "So11111111111111111111111111111111111111112",
  },
} as const;

/**
 * Get Light Protocol configuration for the current cluster.
 * Uses Helius RPC for compression operations when API key is available.
 */
export function getLightConfig(): LightProtocolConfig {
  const cluster = getCluster();
  const apiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY;

  const baseRpcUrl =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";

  let compressionRpcEndpoint: string;
  if (apiKey) {
    const heliusBase =
      cluster === "mainnet-beta"
        ? "https://mainnet.helius-rpc.com"
        : "https://devnet.helius-rpc.com";
    compressionRpcEndpoint = `${heliusBase}?api-key=${apiKey}`;
  } else {
    compressionRpcEndpoint = baseRpcUrl;
  }

  return {
    cluster,
    rpcEndpoint: baseRpcUrl,
    compressionRpcEndpoint,
    knownMints: LIGHT_KNOWN_MINTS[cluster],
  };
}

/**
 * Simulate a transaction before sending.
 * Returns simulation result or error.
 */
export async function simulateTransaction(
  connection: import("@solana/web3.js").Connection,
  transaction: import("@solana/web3.js").VersionedTransaction
): Promise<{
  success: boolean;
  logs?: string[];
  unitsConsumed?: number;
  error?: string;
}> {
  try {
    const simulation = await connection.simulateTransaction(transaction, {
      sigVerify: false,
      replaceRecentBlockhash: true,
    });

    if (simulation.value.err) {
      return {
        success: false,
        logs: simulation.value.logs ?? undefined,
        error: JSON.stringify(simulation.value.err),
      };
    }

    return {
      success: true,
      logs: simulation.value.logs ?? undefined,
      unitsConsumed: simulation.value.unitsConsumed ?? undefined,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Simulation failed",
    };
  }
}

/**
 * Build and sign a VersionedTransaction with proper blockhash handling.
 */
export async function buildVersionedTransaction(
  connection: import("@solana/web3.js").Connection,
  payer: import("@solana/web3.js").PublicKey,
  instructions: import("@solana/web3.js").TransactionInstruction[],
  addressLookupTables?: import("@solana/web3.js").AddressLookupTableAccount[]
): Promise<{
  transaction: import("@solana/web3.js").VersionedTransaction;
  blockhash: string;
  lastValidBlockHeight: number;
}> {
  const { VersionedTransaction, MessageV0 } = await getWeb3();

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("finalized");

  const message = MessageV0.compile({
    payerKey: payer,
    instructions,
    recentBlockhash: blockhash,
    addressLookupTableAccounts: addressLookupTables,
  });

  const transaction = new VersionedTransaction(message);

  return {
    transaction,
    blockhash,
    lastValidBlockHeight,
  };
}

/**
 * Check if a blockhash is still valid.
 */
export async function isBlockhashValid(
  connection: import("@solana/web3.js").Connection,
  blockhash: string
): Promise<boolean> {
  try {
    const result = await connection.isBlockhashValid(blockhash);
    return result.value;
  } catch {
    return false;
  }
}

/**
 * Retry transaction submission with fresh blockhash on expiry.
 * This handles the common "blockhash expired" error.
 */
export async function withBlockhashRetry<T>(
  operation: (connection: import("@solana/web3.js").Connection) => Promise<T>,
  connection: import("@solana/web3.js").Connection,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation(connection);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      const isBlockhashError =
        error.message.includes("Blockhash not found") ||
        error.message.includes("block height exceeded") ||
        error.message.includes("blockhash expired");

      if (isBlockhashError && attempt < maxRetries - 1) {
        console.log(
          `[SolanaAdapter] Blockhash expired, retrying (attempt ${attempt + 2}/${maxRetries})...`
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
        lastError = error;
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error("Transaction failed after retries");
}

/**
 * Create compute budget instructions for priority fees.
 */
export async function createComputeBudgetInstructions(
  units: number,
  microLamports: number
): Promise<import("@solana/web3.js").TransactionInstruction[]> {
  const { ComputeBudgetProgram } = await getWeb3();

  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
  ];
}

/**
 * Serialize a transaction to base64 for wallet adapter transmission.
 */
export function serializeTransactionBase64(
  transaction: import("@solana/web3.js").VersionedTransaction
): string {
  return Buffer.from(transaction.serialize()).toString("base64");
}

/**
 * Wait for transaction confirmation with timeout.
 */
export async function confirmTransaction(
  connection: import("@solana/web3.js").Connection,
  signature: string,
  blockhash: string,
  lastValidBlockHeight: number,
  commitment: import("@solana/web3.js").Commitment = "confirmed"
): Promise<{ confirmed: boolean; error?: string }> {
  try {
    const result = await connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight,
      },
      commitment
    );

    if (result.value.err) {
      return {
        confirmed: false,
        error: JSON.stringify(result.value.err),
      };
    }

    return { confirmed: true };
  } catch (err) {
    return {
      confirmed: false,
      error: err instanceof Error ? err.message : "Confirmation failed",
    };
  }
}
