import { getCluster } from "./solana-adapter";

export interface WebhookConfig {
  vaultAddress: string;
  webhookUrl: string;
  authToken?: string;
  transactionTypes?: string[];
}

export interface WebhookResponse {
  webhookId: string;
  url: string;
  accountAddresses: string[];
  transactionTypes: string[];
  webhookType: string;
}

function getWebhookApiUrl(): string {
  const apiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY;
  if (!apiKey) {
    throw new Error("NEXT_PUBLIC_HELIUS_API_KEY required for webhook management");
  }

  const cluster = getCluster();
  const base =
    cluster === "mainnet-beta"
      ? "https://api-mainnet.helius-rpc.com"
      : "https://api-devnet.helius-rpc.com";

  return `${base}/v0/webhooks?api-key=${apiKey}`;
}

export async function createVaultWebhook(
  config: WebhookConfig
): Promise<WebhookResponse> {
  const url = getWebhookApiUrl();

  const body = {
    webhookURL: config.webhookUrl,
    transactionTypes: config.transactionTypes ?? ["ANY"],
    accountAddresses: [config.vaultAddress],
    webhookType: "enhanced",
    authHeader: config.authToken ? `Bearer ${config.authToken}` : undefined,
    txnStatus: "all",
    encoding: "jsonParsed",
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create webhook: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  return {
    webhookId: data.id || data.webhookId,
    url: data.url || config.webhookUrl,
    accountAddresses: data.accountAddresses || [config.vaultAddress],
    transactionTypes: data.transactionTypes || config.transactionTypes || ["ANY"],
    webhookType: data.webhookType || "enhanced",
  };
}

export async function deleteWebhook(webhookId: string): Promise<boolean> {
  const apiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY;
  if (!apiKey) {
    throw new Error("NEXT_PUBLIC_HELIUS_API_KEY required");
  }

  const cluster = getCluster();
  const base =
    cluster === "mainnet-beta"
      ? "https://api-mainnet.helius-rpc.com"
      : "https://api-devnet.helius-rpc.com";

  const url = `${base}/v0/webhooks/${webhookId}?api-key=${apiKey}`;

  const response = await fetch(url, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });

  return response.ok;
}

export async function listWebhooks(): Promise<WebhookResponse[]> {
  const url = getWebhookApiUrl();

  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to list webhooks: ${response.status}`);
  }

  return response.json();
}
