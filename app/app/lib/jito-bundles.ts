import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  VersionedTransaction,
  TransactionMessage,
} from "@solana/web3.js";

const JITO_TIP_ACCOUNTS = [
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
  "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
  "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
];

const JITO_BLOCK_ENGINE_URLS = {
  mainnet: "https://mainnet.block-engine.jito.wtf/api/v1/bundles",
  devnet: "https://dallas.testnet.block-engine.jito.wtf/api/v1/bundles",
};

export interface JitoBundleConfig {
  network: "mainnet" | "devnet";
  tipLamports?: number;
}

export function getRandomTipAccount(): PublicKey {
  const index = Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length);
  return new PublicKey(JITO_TIP_ACCOUNTS[index]);
}

export function createTipInstruction(
  payer: PublicKey,
  tipLamports: number = 10_000
): TransactionInstruction {
  return SystemProgram.transfer({
    fromPubkey: payer,
    toPubkey: getRandomTipAccount(),
    lamports: tipLamports,
  });
}

export async function submitJitoBundle(
  connection: Connection,
  instructions: TransactionInstruction[],
  signers: Keypair[],
  config: JitoBundleConfig
): Promise<string> {
  const { network, tipLamports = 10_000 } = config;

  if (signers.length === 0) {
    throw new Error("At least one signer required");
  }

  const payer = signers[0].publicKey;

  const tipIx = createTipInstruction(payer, tipLamports);
  const allInstructions = [tipIx, ...instructions];

  const { blockhash } = await connection.getLatestBlockhash("confirmed");

  const messageV0 = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: allInstructions,
  }).compileToV0Message();

  const transaction = new VersionedTransaction(messageV0);
  transaction.sign(signers);

  const serializedTx = Buffer.from(transaction.serialize()).toString("base64");

  const bundleUrl = JITO_BLOCK_ENGINE_URLS[network];

  const response = await fetch(bundleUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sendBundle",
      params: [[serializedTx]],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jito bundle submission failed: ${errorText}`);
  }

  const result = await response.json();

  if (result.error) {
    throw new Error(`Jito bundle error: ${JSON.stringify(result.error)}`);
  }

  const bundleId = result.result;
  console.log(`[Jito] Bundle submitted: ${bundleId}`);

  return bundleId;
}

export async function getBundleStatus(
  bundleId: string,
  network: "mainnet" | "devnet"
): Promise<{
  status: "pending" | "landed" | "failed";
  slot?: number;
  error?: string;
}> {
  const bundleUrl = JITO_BLOCK_ENGINE_URLS[network];

  const response = await fetch(bundleUrl, {
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
    return { status: "pending" };
  }

  const result = await response.json();

  if (result.error || !result.result?.value?.[0]) {
    return { status: "pending" };
  }

  const bundleStatus = result.result.value[0];

  if (bundleStatus.confirmation_status === "confirmed") {
    return { status: "landed", slot: bundleStatus.slot };
  }

  if (bundleStatus.err) {
    return { status: "failed", error: JSON.stringify(bundleStatus.err) };
  }

  return { status: "pending" };
}

export async function waitForBundleLanding(
  bundleId: string,
  network: "mainnet" | "devnet",
  maxAttempts: number = 30,
  intervalMs: number = 1000
): Promise<{
  landed: boolean;
  slot?: number;
  error?: string;
}> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await getBundleStatus(bundleId, network);

    if (status.status === "landed") {
      return { landed: true, slot: status.slot };
    }

    if (status.status === "failed") {
      return { landed: false, error: status.error };
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return { landed: false, error: "Timeout waiting for bundle confirmation" };
}
