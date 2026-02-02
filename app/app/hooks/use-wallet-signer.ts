"use client";

import { useMemo } from "react";
import { useWalletConnection, useWalletActions } from "@solana/react-hooks";
import type { Connection } from "@solana/web3.js";
import { serializeTransactionBase64 } from "../lib/solana-adapter";

export interface SignAndSendResult {
  success: boolean;
  signature?: string;
  error?: string;
}

export interface WalletSignerAdapter {
  sendTransaction(
    connection: Connection,
    txOrBase64: unknown,
    options?: { skipPreflight?: boolean; commitment?: string }
  ): Promise<SignAndSendResult>;
  sendBase64Transaction(
    base64Tx: string,
    commitment?: string
  ): Promise<SignAndSendResult>;
}

export interface UseWalletSignerReturn {
  signer: WalletSignerAdapter | null;
  isReady: boolean;
  error: string | null;
}

export function useWalletSigner(): UseWalletSignerReturn {
  const { wallet, status } = useWalletConnection();
  const walletActions = useWalletActions();

  const signer = useMemo(() => {
    if (status !== "connected" || !wallet) {
      return null;
    }

    const adapter: WalletSignerAdapter = {
      async sendTransaction(
        _connection: Connection,
        txOrBase64: unknown,
        options?: { skipPreflight?: boolean; commitment?: string }
      ): Promise<SignAndSendResult> {
        try {
          let base64Tx: string;

          if (typeof txOrBase64 === "string") {
            base64Tx = txOrBase64;
          } else if (txOrBase64 && typeof txOrBase64 === "object" && "serialize" in txOrBase64) {
            const tx = txOrBase64 as { serialize: () => Uint8Array };
            base64Tx = serializeTransactionBase64(tx as never);
          } else {
            return { success: false, error: "Invalid transaction format" };
          }

          const commitment = options?.commitment || "confirmed";
          const signature = await walletActions.sendTransaction(
            base64Tx as never,
            commitment as "confirmed"
          );

          return { success: true, signature: signature as string };
        } catch (err) {
          const message = err instanceof Error ? err.message : "Transaction failed";
          return { success: false, error: message };
        }
      },

      async sendBase64Transaction(
        base64Tx: string,
        commitment: string = "confirmed"
      ): Promise<SignAndSendResult> {
        try {
          const signature = await walletActions.sendTransaction(
            base64Tx as never,
            commitment as "confirmed"
          );
          return { success: true, signature: signature as string };
        } catch (err) {
          const message = err instanceof Error ? err.message : "Transaction failed";
          return { success: false, error: message };
        }
      },
    };

    return adapter;
  }, [status, wallet, walletActions]);

  const isReady = status === "connected" && signer !== null;
  const error = status === "connected" && !signer
    ? "Wallet does not support required signing methods"
    : null;

  return { signer, isReady, error };
}
