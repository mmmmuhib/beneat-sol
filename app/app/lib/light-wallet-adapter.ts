"use client";

/**
 * Light Protocol Wallet Adapter
 *
 * Bridges @solana/react-hooks wallet interface to Light Protocol SDK.
 * The SDK expects Signer interface (with secretKey), but browser wallets
 * provide signTransaction. This adapter builds instructions and handles
 * signing via the wallet adapter.
 */

import type { Connection, PublicKey, TransactionInstruction, VersionedTransaction } from "@solana/web3.js";
import type { BN } from "@coral-xyz/anchor";

export interface LightWalletAdapter {
  publicKey: PublicKey;
  signAndSendTransaction: (
    connection: Connection,
    instructions: TransactionInstruction[]
  ) => Promise<string>;
}

export interface WalletSignTransaction {
  <T extends VersionedTransaction>(transaction: T): Promise<T>;
}

/**
 * Create a Light Protocol wallet adapter from wallet-standard components.
 */
export async function createLightWalletAdapter(
  walletAddress: string,
  signTransaction: WalletSignTransaction,
  connection: Connection
): Promise<LightWalletAdapter> {
  const { PublicKey, VersionedTransaction, MessageV0, ComputeBudgetProgram } =
    await import("@solana/web3.js");

  const publicKey = new PublicKey(walletAddress);

  return {
    publicKey,
    signAndSendTransaction: async (
      conn: Connection,
      instructions: TransactionInstruction[]
    ): Promise<string> => {
      const computeIxs = [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
      ];

      const allInstructions = [...computeIxs, ...instructions];

      const { blockhash, lastValidBlockHeight } =
        await conn.getLatestBlockhash("finalized");

      const message = MessageV0.compile({
        payerKey: publicKey,
        instructions: allInstructions,
        recentBlockhash: blockhash,
      });

      const transaction = new VersionedTransaction(message);
      const signedTx = await signTransaction(transaction);

      const signature = await conn.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      await conn.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      return signature;
    },
  };
}

export interface CompressParams {
  mint: PublicKey;
  amount: BN;
  sourceAta: PublicKey;
  toAddress: PublicKey;
}

export interface DecompressParams {
  mint: PublicKey;
  amount: BN;
  destinationAta: PublicKey;
}

export interface TransferParams {
  mint: PublicKey;
  amount: BN;
  toAddress: PublicKey;
}

export interface ApproveParams {
  mint: PublicKey;
  amount: BN;
  delegate: PublicKey;
}

/**
 * Compress SPL tokens to compressed state using wallet adapter.
 */
export async function compressWithAdapter(
  adapter: LightWalletAdapter,
  rpcEndpoint: string,
  params: CompressParams
): Promise<string> {
  const { createRpc, selectStateTreeInfo } = await import(
    "@lightprotocol/stateless.js"
  );
  const { CompressedTokenProgram, getTokenPoolInfos, selectTokenPoolInfo } =
    await import("@lightprotocol/compressed-token");
  const { Connection } = await import("@solana/web3.js");

  const rpc = createRpc(rpcEndpoint, rpcEndpoint, rpcEndpoint);
  const connection = new Connection(rpcEndpoint.split("?")[0], "confirmed");

  const poolInfos = await getTokenPoolInfos(rpc, params.mint);
  if (poolInfos.length === 0) {
    throw new Error(`No token pool found for mint ${params.mint.toBase58()}`);
  }
  const tokenPoolInfo = selectTokenPoolInfo(poolInfos);

  const treeInfos = await rpc.getStateTreeInfos();
  const outputStateTreeInfo = selectStateTreeInfo(treeInfos);

  const ix = await CompressedTokenProgram.compress({
    payer: adapter.publicKey,
    owner: adapter.publicKey,
    source: params.sourceAta,
    toAddress: params.toAddress,
    mint: params.mint,
    amount: params.amount,
    outputStateTreeInfo,
    tokenPoolInfo,
  });

  return adapter.signAndSendTransaction(connection, [ix]);
}

/**
 * Decompress compressed tokens to SPL format using wallet adapter.
 */
export async function decompressWithAdapter(
  adapter: LightWalletAdapter,
  rpcEndpoint: string,
  params: DecompressParams
): Promise<string> {
  const { createRpc, bn } = await import("@lightprotocol/stateless.js");
  const {
    CompressedTokenProgram,
    selectMinCompressedTokenAccountsForTransfer,
    getTokenPoolInfos,
    selectTokenPoolInfosForDecompression,
  } = await import("@lightprotocol/compressed-token");
  const { Connection } = await import("@solana/web3.js");

  const rpc = createRpc(rpcEndpoint, rpcEndpoint, rpcEndpoint);
  const connection = new Connection(rpcEndpoint.split("?")[0], "confirmed");

  const compressedAccounts = await rpc.getCompressedTokenAccountsByOwner(
    adapter.publicKey,
    { mint: params.mint }
  );

  if (!compressedAccounts.items || compressedAccounts.items.length === 0) {
    throw new Error("No compressed token accounts found");
  }

  const [inputAccounts] = selectMinCompressedTokenAccountsForTransfer(
    compressedAccounts.items,
    params.amount
  );

  const proof = await rpc.getValidityProof(
    inputAccounts.map((account) => account.compressedAccount.hash)
  );

  const poolInfos = await getTokenPoolInfos(rpc, params.mint);
  if (poolInfos.length === 0) {
    throw new Error(`No token pool found for mint ${params.mint.toBase58()}`);
  }
  const tokenPoolInfos = selectTokenPoolInfosForDecompression(
    poolInfos,
    params.amount
  );

  const ix = await CompressedTokenProgram.decompress({
    payer: adapter.publicKey,
    inputCompressedTokenAccounts: inputAccounts,
    toAddress: params.destinationAta,
    amount: params.amount,
    recentInputStateRootIndices: proof.rootIndices,
    recentValidityProof: proof.compressedProof,
    tokenPoolInfos,
  });

  return adapter.signAndSendTransaction(connection, [ix]);
}

/**
 * Transfer compressed tokens using wallet adapter.
 */
export async function transferWithAdapter(
  adapter: LightWalletAdapter,
  rpcEndpoint: string,
  params: TransferParams
): Promise<string> {
  const { createRpc } = await import("@lightprotocol/stateless.js");
  const {
    CompressedTokenProgram,
    selectMinCompressedTokenAccountsForTransfer,
  } = await import("@lightprotocol/compressed-token");
  const { Connection } = await import("@solana/web3.js");

  const rpc = createRpc(rpcEndpoint, rpcEndpoint, rpcEndpoint);
  const connection = new Connection(rpcEndpoint.split("?")[0], "confirmed");

  const compressedAccounts = await rpc.getCompressedTokenAccountsByOwner(
    adapter.publicKey,
    { mint: params.mint }
  );

  if (!compressedAccounts.items || compressedAccounts.items.length === 0) {
    throw new Error("No compressed token accounts found");
  }

  const [inputAccounts] = selectMinCompressedTokenAccountsForTransfer(
    compressedAccounts.items,
    params.amount
  );

  const proof = await rpc.getValidityProof(
    inputAccounts.map((account) => account.compressedAccount.hash)
  );

  const ix = await CompressedTokenProgram.transfer({
    payer: adapter.publicKey,
    inputCompressedTokenAccounts: inputAccounts,
    toAddress: params.toAddress,
    amount: params.amount,
    recentInputStateRootIndices: proof.rootIndices,
    recentValidityProof: proof.compressedProof,
  });

  return adapter.signAndSendTransaction(connection, [ix]);
}

/**
 * Approve a delegate for compressed token operations.
 *
 * Note: The SDK's approve instruction builder may have different parameter names
 * across versions. We use type assertion to handle SDK API variations.
 */
export async function approveWithAdapter(
  adapter: LightWalletAdapter,
  rpcEndpoint: string,
  params: ApproveParams
): Promise<string> {
  const { createRpc } = await import("@lightprotocol/stateless.js");
  const {
    CompressedTokenProgram,
    selectMinCompressedTokenAccountsForTransfer,
  } = await import("@lightprotocol/compressed-token");
  const { Connection } = await import("@solana/web3.js");

  const rpc = createRpc(rpcEndpoint, rpcEndpoint, rpcEndpoint);
  const connection = new Connection(rpcEndpoint.split("?")[0], "confirmed");

  const compressedAccounts = await rpc.getCompressedTokenAccountsByOwner(
    adapter.publicKey,
    { mint: params.mint }
  );

  if (!compressedAccounts.items || compressedAccounts.items.length === 0) {
    throw new Error("No compressed token accounts found for approval");
  }

  const [inputAccounts] = selectMinCompressedTokenAccountsForTransfer(
    compressedAccounts.items,
    params.amount
  );

  const proof = await rpc.getValidityProof(
    inputAccounts.map((account) => account.compressedAccount.hash)
  );

  const approveParams = {
    payer: adapter.publicKey,
    inputCompressedTokenAccounts: inputAccounts,
    toDelegate: params.delegate,
    delegatedAmount: params.amount,
    recentInputStateRootIndices: proof.rootIndices,
    recentValidityProof: proof.compressedProof,
  };

  const ix = await (CompressedTokenProgram.approve as unknown as (params: typeof approveParams) => Promise<import("@solana/web3.js").TransactionInstruction>)(approveParams);

  return adapter.signAndSendTransaction(connection, [ix]);
}

/**
 * Revoke delegate authority for compressed tokens.
 */
export async function revokeWithAdapter(
  adapter: LightWalletAdapter,
  rpcEndpoint: string,
  mint: PublicKey
): Promise<string> {
  const { createRpc } = await import("@lightprotocol/stateless.js");
  const { CompressedTokenProgram } = await import(
    "@lightprotocol/compressed-token"
  );
  const { Connection } = await import("@solana/web3.js");

  const rpc = createRpc(rpcEndpoint, rpcEndpoint, rpcEndpoint);
  const connection = new Connection(rpcEndpoint.split("?")[0], "confirmed");

  const compressedAccounts = await rpc.getCompressedTokenAccountsByOwner(
    adapter.publicKey,
    { mint }
  );

  if (!compressedAccounts.items || compressedAccounts.items.length === 0) {
    throw new Error("No compressed token accounts found for revoke");
  }

  const delegatedAccounts = compressedAccounts.items.filter(
    (acc) => (acc.parsed as { delegate?: unknown }).delegate !== undefined &&
             (acc.parsed as { delegate?: unknown }).delegate !== null
  );

  if (delegatedAccounts.length === 0) {
    throw new Error("No delegated compressed token accounts found");
  }

  const proof = await rpc.getValidityProof(
    delegatedAccounts.map((account) => account.compressedAccount.hash)
  );

  const revokeParams = {
    payer: adapter.publicKey,
    inputCompressedTokenAccounts: delegatedAccounts,
    recentInputStateRootIndices: proof.rootIndices,
    recentValidityProof: proof.compressedProof,
  };

  const ix = await (CompressedTokenProgram.revoke as unknown as (params: typeof revokeParams) => Promise<import("@solana/web3.js").TransactionInstruction>)(revokeParams);

  return adapter.signAndSendTransaction(connection, [ix]);
}
