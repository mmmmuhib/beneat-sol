"use client";

import type { Connection } from "@solana/web3.js";

export interface SignAndSendResult {
  success: boolean;
  signature?: string;
  error?: string;
}

export async function confirmTransactionWithRetry(
  connection: Connection,
  signature: string,
  maxAttempts: number = 30,
  intervalMs: number = 1000
): Promise<{ confirmed: boolean; error?: string }> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const status = await connection.getSignatureStatus(signature);

      if (status.value?.confirmationStatus === "confirmed" ||
          status.value?.confirmationStatus === "finalized") {
        return { confirmed: true };
      }

      if (status.value?.err) {
        return { confirmed: false, error: JSON.stringify(status.value.err) };
      }

      await new Promise(resolve => setTimeout(resolve, intervalMs));
    } catch {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }

  return { confirmed: false, error: "Transaction confirmation timeout" };
}
