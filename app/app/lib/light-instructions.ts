import type {
  Connection,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import type { BN } from "@coral-xyz/anchor";

export const LIGHT_SYSTEM_PROGRAM_ID = "SySTEM1eSU2p4BGQfQpimFEWWSC1XDFeun3Nqzz3rT7";
export const COMPRESSED_TOKEN_PROGRAM_ID = "cTokenmWW8bLPjZEBAUgYy3zKxQZW6VKi7bqNFEVv3m";

export interface DecompressInstructionParams {
  payer: PublicKey;
  owner: PublicKey;
  mint: PublicKey;
  amount: BN;
  destinationAta: PublicKey;
  rpcEndpoint: string;
}

export interface CompressInstructionParams {
  payer: PublicKey;
  owner: PublicKey;
  mint: PublicKey;
  amount: BN;
  sourceAta: PublicKey;
  toAddress: PublicKey;
  rpcEndpoint: string;
}

export interface LightInstructionResult {
  instruction: TransactionInstruction | null;
  lookupTableAccounts?: PublicKey[];
  error?: string;
}

/**
 * Build a decompress instruction using the Light Protocol SDK.
 * This replaces the manual instruction building with SDK-based construction.
 */
export async function buildDecompressInstruction(
  params: DecompressInstructionParams
): Promise<LightInstructionResult> {
  try {
    const { createRpc } = await import("@lightprotocol/stateless.js");
    const {
      CompressedTokenProgram,
      selectMinCompressedTokenAccountsForTransfer,
      getTokenPoolInfos,
      selectTokenPoolInfosForDecompression,
    } = await import("@lightprotocol/compressed-token");

    const rpc = createRpc(
      params.rpcEndpoint,
      params.rpcEndpoint,
      params.rpcEndpoint
    );

    const compressedAccounts = await rpc.getCompressedTokenAccountsByOwner(
      params.owner,
      { mint: params.mint }
    );

    if (!compressedAccounts.items || compressedAccounts.items.length === 0) {
      return { instruction: null, error: "No compressed token accounts found" };
    }

    const [inputAccounts] = selectMinCompressedTokenAccountsForTransfer(
      compressedAccounts.items,
      params.amount
    );

    if (inputAccounts.length === 0) {
      return { instruction: null, error: "Insufficient compressed balance" };
    }

    const proof = await rpc.getValidityProof(
      inputAccounts.map((account) => account.compressedAccount.hash)
    );

    const poolInfos = await getTokenPoolInfos(rpc, params.mint);
    if (poolInfos.length === 0) {
      return {
        instruction: null,
        error: `No token pool found for mint ${params.mint.toBase58()}`,
      };
    }
    const tokenPoolInfos = selectTokenPoolInfosForDecompression(
      poolInfos,
      params.amount
    );

    const instruction = await CompressedTokenProgram.decompress({
      payer: params.payer,
      inputCompressedTokenAccounts: inputAccounts,
      toAddress: params.destinationAta,
      amount: params.amount,
      recentInputStateRootIndices: proof.rootIndices,
      recentValidityProof: proof.compressedProof,
      tokenPoolInfos,
    });

    return { instruction };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to build decompress instruction";
    console.error("[Light Instructions] Decompress build error:", err);
    return { instruction: null, error: message };
  }
}

/**
 * Build a compress instruction using the Light Protocol SDK.
 * This replaces the manual instruction building with SDK-based construction.
 */
export async function buildCompressInstruction(
  params: CompressInstructionParams
): Promise<LightInstructionResult> {
  try {
    const { createRpc, selectStateTreeInfo } = await import(
      "@lightprotocol/stateless.js"
    );
    const { CompressedTokenProgram, getTokenPoolInfos, selectTokenPoolInfo } =
      await import("@lightprotocol/compressed-token");

    const rpc = createRpc(
      params.rpcEndpoint,
      params.rpcEndpoint,
      params.rpcEndpoint
    );

    const poolInfos = await getTokenPoolInfos(rpc, params.mint);
    if (poolInfos.length === 0) {
      return {
        instruction: null,
        error: `No token pool found for mint ${params.mint.toBase58()}`,
      };
    }
    const tokenPoolInfo = selectTokenPoolInfo(poolInfos);

    const treeInfos = await rpc.getStateTreeInfos();
    const outputStateTreeInfo = selectStateTreeInfo(treeInfos);

    const instruction = await CompressedTokenProgram.compress({
      payer: params.payer,
      owner: params.owner,
      source: params.sourceAta,
      toAddress: params.toAddress,
      mint: params.mint,
      amount: params.amount,
      outputStateTreeInfo,
      tokenPoolInfo,
    });

    return { instruction };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to build compress instruction";
    console.error("[Light Instructions] Compress build error:", err);
    return { instruction: null, error: message };
  }
}

export async function getTokenPoolPda(
  connection: Connection,
  mint: PublicKey
): Promise<PublicKey | null> {
  try {
    const { PublicKey: SolanaPublicKey } = await import("@solana/web3.js");

    const compressedTokenProgram = new SolanaPublicKey(COMPRESSED_TOKEN_PROGRAM_ID);

    const [tokenPoolPda] = SolanaPublicKey.findProgramAddressSync(
      [Buffer.from("token_pool"), mint.toBuffer()],
      compressedTokenProgram
    );

    const accountInfo = await connection.getAccountInfo(tokenPoolPda);
    if (!accountInfo) {
      console.warn("[Light Instructions] Token pool not found for mint:", mint.toBase58());
      return null;
    }

    return tokenPoolPda;
  } catch (err) {
    console.error("[Light Instructions] Failed to get token pool PDA:", err);
    return null;
  }
}

export async function getCompressedTokenAccountsForOwner(
  rpcEndpoint: string,
  owner: PublicKey,
  mint: PublicKey
): Promise<
  Array<{
    merkleTree: PublicKey;
    leafIndex: number;
    hash: Uint8Array;
    amount: bigint;
  }>
> {
  try {
    const { createRpc } = await import("@lightprotocol/stateless.js");
    const { PublicKey: SolanaPublicKey } = await import("@solana/web3.js");

    const connection = createRpc(rpcEndpoint, rpcEndpoint, rpcEndpoint);

    const result = await connection.getCompressedTokenAccountsByOwner(owner, {
      mint,
    });

    if (!result.items || result.items.length === 0) {
      return [];
    }

    return result.items.map((item) => {
      const merkleContext = (item as { compressedAccount?: { merkleContext?: { merkleTreePubkeyIndex?: number; leafIndex?: number } } }).compressedAccount?.merkleContext;
      const hash = (item as { hash?: string | Uint8Array }).hash;

      return {
        merkleTree: new SolanaPublicKey(
          (item as { compressedAccount?: { merkleTree?: string } }).compressedAccount?.merkleTree || owner.toBase58()
        ),
        leafIndex: merkleContext?.leafIndex || 0,
        hash: typeof hash === "string" ? Buffer.from(hash, "hex") : hash || new Uint8Array(32),
        amount: BigInt(item.parsed.amount.toString()),
      };
    });
  } catch (err) {
    console.error("[Light Instructions] Failed to get compressed accounts:", err);
    return [];
  }
}

export function selectAccountsForAmount(
  accounts: Array<{
    merkleTree: PublicKey;
    leafIndex: number;
    hash: Uint8Array;
    amount: bigint;
  }>,
  targetAmount: bigint
): Array<{
  merkleTree: PublicKey;
  leafIndex: number;
  hash: Uint8Array;
}> {
  const selected: typeof accounts = [];
  let accumulated = 0n;

  const sorted = [...accounts].sort((a, b) =>
    a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : 0
  );

  for (const acc of sorted) {
    if (accumulated >= targetAmount) break;
    selected.push(acc);
    accumulated += acc.amount;
  }

  if (accumulated < targetAmount) {
    console.warn(
      "[Light Instructions] Insufficient compressed balance:",
      accumulated.toString(),
      "needed:",
      targetAmount.toString()
    );
  }

  return selected.map((acc) => ({
    merkleTree: acc.merkleTree,
    leafIndex: acc.leafIndex,
    hash: acc.hash,
  }));
}
