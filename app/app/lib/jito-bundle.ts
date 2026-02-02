import type {
  Connection,
  PublicKey,
  TransactionInstruction,
  AddressLookupTableAccount,
  TransactionSignature,
} from "@solana/web3.js";

export interface BundleResult {
  success: boolean;
  signature?: TransactionSignature;
  bundleId?: string;
  error?: string;
}

export interface RetryConfig {
  maxRetries?: number;
  tipEscalation?: number;
  maxTipLamports?: number;
}

export interface SubmitBundleParams {
  instructions: TransactionInstruction[];
  payer: PublicKey;
  connection: Connection;
  signTransaction: <T extends { serialize: () => Uint8Array }>(tx: T) => Promise<T>;
  addressLookupTables?: AddressLookupTableAccount[];
  tipAmount?: number;
  priorityLevel?: "low" | "medium" | "high";
  computeUnits?: number;
  isDevMode?: boolean;
}

export const JITO_TIP_ACCOUNTS = [
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
  "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
  "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
] as const;

export const JITO_BLOCK_ENGINE_URL = "https://mainnet.block-engine.jito.wtf";

export const MINIMUM_TIP_LAMPORTS = 10000;

export const SHIELDED_TRADE_COMPUTE_UNITS = 1_400_000;

export function getRandomTipAccount(): string {
  const index = Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length);
  return JITO_TIP_ACCOUNTS[index];
}

export async function createTipInstruction(
  payer: PublicKey,
  tipAmount: number = MINIMUM_TIP_LAMPORTS
): Promise<TransactionInstruction> {
  const { SystemProgram, PublicKey: SolanaPublicKey } = await import(
    "@solana/web3.js"
  );

  const tipAccount = getRandomTipAccount();

  return SystemProgram.transfer({
    fromPubkey: payer,
    toPubkey: new SolanaPublicKey(tipAccount),
    lamports: tipAmount,
  });
}

async function simulateDevModeBundle(
  instructions: TransactionInstruction[]
): Promise<BundleResult> {
  await new Promise((resolve) => setTimeout(resolve, 800));

  const mockSignature = `jito-bundle-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const mockBundleId = `bundle-${Math.random().toString(36).slice(2, 14)}`;

  console.log(
    `[Jito Bundle] Dev mode: Simulated bundle with ${instructions.length} instructions`
  );

  return {
    success: true,
    signature: mockSignature,
    bundleId: mockBundleId,
  };
}

async function submitBundleToJito(
  serializedTransactions: string[]
): Promise<{ bundleId: string }> {
  const response = await fetch(`${JITO_BLOCK_ENGINE_URL}/api/v1/bundles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sendBundle",
      params: [serializedTransactions],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jito bundle submission failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();

  if (result.error) {
    throw new Error(`Jito bundle error: ${result.error.message || JSON.stringify(result.error)}`);
  }

  return { bundleId: result.result };
}

async function getBundleStatus(
  bundleId: string
): Promise<{ status: string; landed?: boolean }> {
  const response = await fetch(`${JITO_BLOCK_ENGINE_URL}/api/v1/bundles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getBundleStatuses",
      params: [[bundleId]],
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get bundle status: ${response.status}`);
  }

  const result = await response.json();

  if (result.error) {
    throw new Error(`Bundle status error: ${result.error.message}`);
  }

  const statuses = result.result?.value || [];
  if (statuses.length === 0) {
    return { status: "pending" };
  }

  const bundleStatus = statuses[0];
  return {
    status: bundleStatus.confirmation_status || "unknown",
    landed: bundleStatus.confirmation_status === "confirmed" ||
            bundleStatus.confirmation_status === "finalized",
  };
}

export async function submitAtomicBundle(
  params: SubmitBundleParams
): Promise<BundleResult> {
  const {
    instructions,
    payer,
    connection,
    signTransaction,
    addressLookupTables = [],
    tipAmount,
    priorityLevel = "medium",
    computeUnits,
    isDevMode = false,
  } = params;

  if (isDevMode) {
    return simulateDevModeBundle(instructions);
  }

  if (instructions.length === 0) {
    return {
      success: false,
      error: "No instructions provided",
    };
  }

  try {
    const { VersionedTransaction, MessageV0, ComputeBudgetProgram } = await import("@solana/web3.js");

    const effectiveTip = tipAmount ?? await estimateBundleTip(connection, priorityLevel);

    const effectiveComputeUnits = computeUnits ?? SHIELDED_TRADE_COMPUTE_UNITS;

    const setCULimitIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: effectiveComputeUnits,
    });

    const priorityFeeMultipliers: Record<string, number> = {
      low: 1000,
      medium: 50000,
      high: 200000,
    };
    const setPriorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: priorityFeeMultipliers[priorityLevel],
    });

    const tipInstruction = await createTipInstruction(payer, effectiveTip);

    const allInstructions = [setCULimitIx, setPriorityFeeIx, ...instructions, tipInstruction];

    const { blockhash } = await connection.getLatestBlockhash("finalized");

    const message = MessageV0.compile({
      payerKey: payer,
      instructions: allInstructions,
      recentBlockhash: blockhash,
      addressLookupTableAccounts: addressLookupTables,
    });

    const transaction = new VersionedTransaction(message);

    const simResult = await connection.simulateTransaction(transaction, {
      sigVerify: false,
      replaceRecentBlockhash: true,
    });

    if (simResult.value.err) {
      const errorLogs = simResult.value.logs?.slice(-5).join("\n") || "No logs";
      console.error("[Jito Bundle] Simulation failed:", simResult.value.err);
      console.error("[Jito Bundle] Last logs:", errorLogs);
      return {
        success: false,
        error: `Transaction simulation failed: ${JSON.stringify(simResult.value.err)}`,
      };
    }

    console.log(
      `[Jito Bundle] Simulation passed, CUs used: ${simResult.value.unitsConsumed || "unknown"}`
    );

    const signedTransaction = await signTransaction(transaction);

    const serializedTx = Buffer.from(signedTransaction.serialize()).toString("base64");

    const { bundleId } = await submitBundleToJito([serializedTx]);

    console.log(`[Jito Bundle] Submitted bundle: ${bundleId}`);

    let attempts = 0;
    const maxAttempts = 30;
    const pollIntervalMs = 2000;

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      attempts++;

      try {
        const status = await getBundleStatus(bundleId);
        console.log(`[Jito Bundle] Status check ${attempts}:`, status.status);

        if (status.landed) {
          const signatures = await connection.getSignaturesForAddress(payer, {
            limit: 5,
          });

          const recentSignature = signatures.find((sig) => {
            const sigTime = sig.blockTime ? sig.blockTime * 1000 : 0;
            const submissionTime = Date.now() - (attempts * pollIntervalMs);
            return sigTime >= submissionTime - 60000;
          });

          return {
            success: true,
            signature: recentSignature?.signature || bundleId,
            bundleId,
          };
        }

        if (status.status === "failed" || status.status === "rejected") {
          return {
            success: false,
            error: `Bundle ${status.status}`,
            bundleId,
          };
        }
      } catch (statusError) {
        console.warn(`[Jito Bundle] Status check failed:`, statusError);
      }
    }

    return {
      success: false,
      error: "Bundle confirmation timeout",
      bundleId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error submitting bundle";
    console.error("[Jito Bundle] Submission error:", err);
    return {
      success: false,
      error: message,
    };
  }
}

export async function submitAtomicBundleWithRetry(
  params: SubmitBundleParams,
  retryConfig?: RetryConfig
): Promise<BundleResult> {
  const {
    maxRetries = 3,
    tipEscalation = 1.5,
    maxTipLamports = 500_000,
  } = retryConfig ?? {};

  let currentTip =
    params.tipAmount ??
    (await estimateBundleTip(params.connection, params.priorityLevel ?? "medium"));

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(
      `[Jito Bundle] Attempt ${attempt}/${maxRetries}, tip: ${currentTip} lamports`
    );

    const result = await submitAtomicBundle({
      ...params,
      tipAmount: currentTip,
    });

    if (result.success) {
      return result;
    }

    if (
      result.error?.includes("simulation failed") ||
      result.error?.includes("No instructions")
    ) {
      return result;
    }

    if (attempt < maxRetries) {
      currentTip = Math.min(
        Math.floor(currentTip * tipEscalation),
        maxTipLamports
      );
      console.log(
        `[Jito Bundle] Retry ${attempt + 1} with escalated tip: ${currentTip}`
      );
    }
  }

  return {
    success: false,
    error: `Bundle failed after ${maxRetries} attempts`,
  };
}

export async function submitMultiTransactionBundle(params: {
  transactions: Array<{
    instructions: TransactionInstruction[];
    signers?: Array<{ secretKey: Uint8Array }>;
  }>;
  payer: PublicKey;
  connection: Connection;
  signTransaction: <T extends { serialize: () => Uint8Array }>(tx: T) => Promise<T>;
  addressLookupTables?: AddressLookupTableAccount[];
  tipAmount?: number;
  priorityLevel?: "low" | "medium" | "high";
  computeUnitsPerTx?: number;
  isDevMode?: boolean;
}): Promise<BundleResult> {
  const {
    transactions,
    payer,
    connection,
    signTransaction,
    addressLookupTables = [],
    tipAmount,
    priorityLevel = "medium",
    computeUnitsPerTx,
    isDevMode = false,
  } = params;

  if (isDevMode) {
    const totalInstructions = transactions.reduce(
      (sum, tx) => sum + tx.instructions.length,
      0
    );
    return simulateDevModeBundle(
      new Array(totalInstructions).fill(null) as TransactionInstruction[]
    );
  }

  if (transactions.length === 0) {
    return {
      success: false,
      error: "No transactions provided",
    };
  }

  if (transactions.length > 5) {
    return {
      success: false,
      error: "Bundle can contain at most 5 transactions",
    };
  }

  try {
    const { VersionedTransaction, MessageV0, ComputeBudgetProgram } = await import("@solana/web3.js");

    const effectiveTip = tipAmount ?? await estimateBundleTip(connection, priorityLevel);
    const effectiveComputeUnits = computeUnitsPerTx ?? SHIELDED_TRADE_COMPUTE_UNITS;

    const { blockhash } = await connection.getLatestBlockhash("finalized");

    const serializedTransactions: string[] = [];

    const priorityFeeMultipliers: Record<string, number> = {
      low: 1000,
      medium: 50000,
      high: 200000,
    };

    for (let i = 0; i < transactions.length; i++) {
      const txData = transactions[i];

      const setCULimitIx = ComputeBudgetProgram.setComputeUnitLimit({
        units: effectiveComputeUnits,
      });
      const setPriorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFeeMultipliers[priorityLevel],
      });

      let instructions = [setCULimitIx, setPriorityFeeIx, ...txData.instructions];

      if (i === transactions.length - 1) {
        const tipInstruction = await createTipInstruction(payer, effectiveTip);
        instructions.push(tipInstruction);
      }

      const message = MessageV0.compile({
        payerKey: payer,
        instructions,
        recentBlockhash: blockhash,
        addressLookupTableAccounts: addressLookupTables,
      });

      const transaction = new VersionedTransaction(message);

      const simResult = await connection.simulateTransaction(transaction, {
        sigVerify: false,
        replaceRecentBlockhash: true,
      });

      if (simResult.value.err) {
        const errorLogs = simResult.value.logs?.slice(-5).join("\n") || "No logs";
        console.error(`[Jito Bundle] Simulation failed for tx ${i + 1}:`, simResult.value.err);
        console.error("[Jito Bundle] Last logs:", errorLogs);
        return {
          success: false,
          error: `Transaction ${i + 1} simulation failed: ${JSON.stringify(simResult.value.err)}`,
        };
      }

      console.log(
        `[Jito Bundle] Tx ${i + 1} simulation passed, CUs: ${simResult.value.unitsConsumed || "unknown"}`
      );

      if (txData.signers && txData.signers.length > 0) {
        transaction.sign(txData.signers as never);
      }

      const signedTransaction = await signTransaction(transaction);
      serializedTransactions.push(
        Buffer.from(signedTransaction.serialize()).toString("base64")
      );
    }

    const { bundleId } = await submitBundleToJito(serializedTransactions);

    console.log(
      `[Jito Bundle] Submitted multi-tx bundle (${transactions.length} txs): ${bundleId}`
    );

    let attempts = 0;
    const maxAttempts = 30;
    const pollIntervalMs = 2000;

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      attempts++;

      try {
        const status = await getBundleStatus(bundleId);

        if (status.landed) {
          return {
            success: true,
            bundleId,
          };
        }

        if (status.status === "failed" || status.status === "rejected") {
          return {
            success: false,
            error: `Bundle ${status.status}`,
            bundleId,
          };
        }
      } catch (statusError) {
        console.warn(`[Jito Bundle] Status check failed:`, statusError);
      }
    }

    return {
      success: false,
      error: "Bundle confirmation timeout",
      bundleId,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error submitting multi-tx bundle";
    console.error("[Jito Bundle] Multi-tx submission error:", err);
    return {
      success: false,
      error: message,
    };
  }
}

export async function submitMultiTransactionBundleWithRetry(
  params: Parameters<typeof submitMultiTransactionBundle>[0],
  retryConfig?: RetryConfig
): Promise<BundleResult> {
  const {
    maxRetries = 3,
    tipEscalation = 1.5,
    maxTipLamports = 500_000,
  } = retryConfig ?? {};

  let currentTip =
    params.tipAmount ??
    (await estimateBundleTip(params.connection, params.priorityLevel ?? "medium"));

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(
      `[Jito Bundle] Multi-tx attempt ${attempt}/${maxRetries}, tip: ${currentTip} lamports`
    );

    const result = await submitMultiTransactionBundle({
      ...params,
      tipAmount: currentTip,
    });

    if (result.success) {
      return result;
    }

    if (
      result.error?.includes("simulation failed") ||
      result.error?.includes("No transactions")
    ) {
      return result;
    }

    if (attempt < maxRetries) {
      currentTip = Math.min(
        Math.floor(currentTip * tipEscalation),
        maxTipLamports
      );
      console.log(
        `[Jito Bundle] Multi-tx retry ${attempt + 1} with escalated tip: ${currentTip}`
      );
    }
  }

  return {
    success: false,
    error: `Multi-tx bundle failed after ${maxRetries} attempts`,
  };
}

export async function estimateBundleTip(
  connection: Connection,
  priorityLevel: "low" | "medium" | "high" = "medium"
): Promise<number> {
  const baseTips: Record<string, number> = {
    low: 10000,
    medium: 50000,
    high: 100000,
  };

  try {
    const { getPriorityFeeEstimate, hasHeliusApiKey } = await import("./helius");

    if (hasHeliusApiKey()) {
      const estimate = await getPriorityFeeEstimate({
        accountKeys: JITO_TIP_ACCOUNTS.slice(0, 3) as unknown as string[],
        includeAllPriorityFeeLevels: true,
      });

      if (estimate.priorityFeeLevels) {
        const levelMap: Record<string, keyof typeof estimate.priorityFeeLevels> = {
          low: "low",
          medium: "medium",
          high: "high",
        };
        const fee = estimate.priorityFeeLevels[levelMap[priorityLevel]];
        if (fee && fee > 0) {
          console.log(`[Jito Bundle] Using Helius priority fee: ${fee} (${priorityLevel})`);
          return Math.max(MINIMUM_TIP_LAMPORTS, fee);
        }
      }

      if (estimate.priorityFeeEstimate > 0) {
        const multipliers: Record<string, number> = {
          low: 0.8,
          medium: 1.0,
          high: 1.5,
        };
        const fee = Math.floor(estimate.priorityFeeEstimate * multipliers[priorityLevel]);
        console.log(`[Jito Bundle] Using Helius estimate: ${fee} (${priorityLevel})`);
        return Math.max(MINIMUM_TIP_LAMPORTS, fee);
      }
    }
  } catch (err) {
    console.warn("[Jito Bundle] Helius priority fee unavailable, using fallback:", err);
  }

  try {
    const recentFees = await connection.getRecentPrioritizationFees({
      lockedWritableAccounts: [],
    });

    if (recentFees.length > 0) {
      const avgFee =
        recentFees.reduce((sum, f) => sum + f.prioritizationFee, 0) /
        recentFees.length;

      const multipliers: Record<string, number> = {
        low: 1.0,
        medium: 1.5,
        high: 2.5,
      };

      return Math.max(
        MINIMUM_TIP_LAMPORTS,
        Math.floor(avgFee * multipliers[priorityLevel])
      );
    }
  } catch (err) {
    console.warn("[Jito Bundle] Failed to estimate tip from recent fees:", err);
  }

  return baseTips[priorityLevel];
}
