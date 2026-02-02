"use client";

import { useState, useEffect, useCallback } from "react";
import {
  useWalletConnection,
  useSendTransaction,
  useBalance,
} from "@solana/react-hooks";
import {
  getProgramDerivedAddress,
  getAddressEncoder,
  getBytesEncoder,
  type Address,
} from "@solana/kit";
import {
  getDepositInstructionDataEncoder,
  getWithdrawInstructionDataEncoder,
  VAULT_PROGRAM_ADDRESS,
} from "../generated/vault";

const LAMPORTS_PER_SOL = 1_000_000_000n;
const SYSTEM_PROGRAM_ADDRESS = "11111111111111111111111111111111" as Address;

export function VaultCard() {
  const { wallet, status } = useWalletConnection();
  const { send, isSending } = useSendTransaction();

  const [amount, setAmount] = useState("");
  const [vaultAddress, setVaultAddress] = useState<Address | null>(null);
  const [txStatus, setTxStatus] = useState<string | null>(null);

  const walletAddress = wallet?.account.address;

  useEffect(() => {
    async function deriveVault() {
      if (!walletAddress) {
        setVaultAddress(null);
        return;
      }

      const [pda] = await getProgramDerivedAddress({
        programAddress: VAULT_PROGRAM_ADDRESS,
        seeds: [
          getBytesEncoder().encode(new Uint8Array([118, 97, 117, 108, 116])),
          getAddressEncoder().encode(walletAddress),
        ],
      });

      setVaultAddress(pda);
    }

    deriveVault();
  }, [walletAddress]);

  const vaultBalance = useBalance(vaultAddress ?? undefined);
  const vaultLamports = vaultBalance?.lamports ?? 0n;
  const vaultSol = Number(vaultLamports) / Number(LAMPORTS_PER_SOL);

  const handleDeposit = useCallback(async () => {
    if (!walletAddress || !vaultAddress || !amount) return;

    try {
      setTxStatus("Building transaction...");

      const depositAmount = BigInt(
        Math.floor(parseFloat(amount) * Number(LAMPORTS_PER_SOL))
      );

      const instruction = {
        programAddress: VAULT_PROGRAM_ADDRESS,
        accounts: [
          { address: walletAddress, role: 3 },
          { address: vaultAddress, role: 1 },
          { address: SYSTEM_PROGRAM_ADDRESS, role: 0 },
        ],
        data: getDepositInstructionDataEncoder().encode({
          amount: depositAmount,
        }),
      };

      setTxStatus("Awaiting signature...");

      const signature = await send({
        instructions: [instruction],
      });

      setTxStatus(`Deposited! Signature: ${signature?.slice(0, 20)}...`);
      setAmount("");
    } catch (err) {
      console.error("Deposit failed:", err);
      setTxStatus(
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  }, [walletAddress, vaultAddress, amount, send]);

  const handleWithdraw = useCallback(async () => {
    if (!walletAddress || !vaultAddress || vaultLamports === 0n) return;

    try {
      setTxStatus("Building transaction...");

      const instruction = {
        programAddress: VAULT_PROGRAM_ADDRESS,
        accounts: [
          { address: walletAddress, role: 3 },
          { address: vaultAddress, role: 1 },
          { address: SYSTEM_PROGRAM_ADDRESS, role: 0 },
        ],
        data: getWithdrawInstructionDataEncoder().encode({
          amount: vaultLamports,
        }),
      };

      setTxStatus("Awaiting signature...");

      const signature = await send({
        instructions: [instruction],
      });

      setTxStatus(`Withdrawn! Signature: ${signature?.slice(0, 20)}...`);
    } catch (err) {
      console.error("Withdraw failed:", err);
      setTxStatus(
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  }, [walletAddress, vaultAddress, vaultLamports, send]);

  if (status !== "connected") {
    return (
      <section className="w-full max-w-3xl space-y-4 rounded-2xl border border-border bg-card p-6 shadow-[0_20px_80px_-50px_rgba(16,185,129,0.15)]">
        <div className="space-y-1">
          <p className="text-lg font-semibold text-foreground">SOL Vault</p>
          <p className="text-sm text-text-muted">
            Connect your wallet to interact with the vault program.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card/50 p-4 text-center text-sm text-text-muted">
          Wallet not connected
        </div>
      </section>
    );
  }

  return (
    <section className="w-full max-w-3xl space-y-4 rounded-2xl border border-border bg-card p-6 shadow-[0_20px_80px_-50px_rgba(16,185,129,0.15)]">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-lg font-semibold text-foreground">SOL Vault</p>
          <p className="text-sm text-text-muted">
            Deposit SOL into your personal vault PDA and withdraw anytime.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
            vaultLamports > 0n
              ? "bg-primary/20 text-primary"
              : "bg-border text-text-muted"
          }`}
        >
          {vaultLamports > 0n ? "Has funds" : "Empty"}
        </span>
      </div>

      <div className="rounded-xl border border-border bg-gradient-to-br from-primary/10 to-transparent p-4">
        <p className="text-xs uppercase tracking-wide text-text-muted">
          Vault Balance
        </p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">
          {vaultSol.toFixed(4)}{" "}
          <span className="text-lg font-normal text-text-muted">SOL</span>
        </p>
        {vaultAddress && (
          <p className="mt-2 truncate font-mono text-xs text-text-muted">
            {vaultAddress}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex gap-3">
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Amount in SOL"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isSending}
            className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground outline-none transition placeholder:text-text-muted focus:border-primary/50 focus:ring-1 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            onClick={handleDeposit}
            disabled={isSending || !amount || parseFloat(amount) <= 0}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-card transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSending ? "Confirming..." : "Deposit"}
          </button>
        </div>
      </div>

      <button
        onClick={handleWithdraw}
        disabled={isSending || vaultLamports === 0n}
        className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isSending ? "Confirming..." : "Withdraw All"}
      </button>

      {txStatus && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            txStatus.startsWith("Error")
              ? "border-status-danger/30 bg-status-danger/10 text-status-danger"
              : txStatus.includes("Confirming")
                ? "border-status-warning/30 bg-status-warning/10 text-status-warning"
                : "border-primary/30 bg-primary/10 text-primary"
          }`}
        >
          {txStatus}
        </div>
      )}

      <div className="border-t border-border pt-4 text-xs text-text-muted">
        <p className="mb-2">
          This vault is an{" "}
          <a
            href="https://www.anchor-lang.com/docs"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline underline-offset-2 hover:text-primary-hover"
          >
            Anchor program
          </a>{" "}
          deployed on devnet. Want to deploy your own?
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href="https://www.anchor-lang.com/docs/quickstart"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 font-medium text-text-secondary transition hover:border-primary/50 hover:text-primary"
          >
            Anchor Quickstart
          </a>
          <a
            href="https://solana.com/docs/programs/deploying"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 font-medium text-text-secondary transition hover:border-primary/50 hover:text-primary"
          >
            Deploy Programs
          </a>
          <a
            href="https://github.com/ZYJLiu/anchor-vault-template"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 font-medium text-text-secondary transition hover:border-primary/50 hover:text-primary"
          >
            Reference Repo
          </a>
        </div>
      </div>
    </section>
  );
}
