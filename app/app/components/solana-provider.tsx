"use client";

import "../polyfills";
import { SolanaProvider } from "@solana/react-hooks";
import { PropsWithChildren, useState, useEffect } from "react";
import { autoDiscover, createClient } from "@solana/client";

const DEFAULT_ENDPOINTS = {
  devnet: "https://api.devnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  localnet: "http://localhost:8899",
} as const;

function getEndpoints(): { endpoint: string; websocketEndpoint: string } {
  const endpoint =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || DEFAULT_ENDPOINTS.devnet;

  let websocketEndpoint = process.env.NEXT_PUBLIC_SOLANA_WS_URL;

  if (!websocketEndpoint) {
    if (endpoint.startsWith("https://")) {
      websocketEndpoint = endpoint.replace("https://", "wss://");
    } else if (endpoint.startsWith("http://")) {
      websocketEndpoint = endpoint.replace("http://", "ws://");
    } else {
      websocketEndpoint = "wss://api.devnet.solana.com";
    }
  }

  return { endpoint, websocketEndpoint };
}

export function getClusterName(): "mainnet-beta" | "devnet" | "localnet" {
  const { endpoint } = getEndpoints();
  if (endpoint.includes("mainnet")) return "mainnet-beta";
  if (endpoint.includes("localhost") || endpoint.includes("127.0.0.1"))
    return "localnet";
  return "devnet";
}

export function SolanaProviderWrapper({ children }: PropsWithChildren) {
  const [client, setClient] = useState<ReturnType<typeof createClient> | null>(
    null
  );

  useEffect(() => {
    const { endpoint, websocketEndpoint } = getEndpoints();
    const newClient = createClient({
      endpoint,
      websocketEndpoint,
      walletConnectors: autoDiscover(),
    });
    setClient(newClient);

    if (process.env.NODE_ENV === "development") {
      console.log("[Solana] Connected to:", getClusterName(), "at", endpoint);
    }
  }, []);

  if (!client) {
    return null;
  }

  return <SolanaProvider client={client}>{children}</SolanaProvider>;
}
