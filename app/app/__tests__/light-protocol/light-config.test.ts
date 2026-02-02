import { describe, it, expect, beforeEach, vi } from "vitest";

describe("Light Protocol Config", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  describe("getLightConfig", () => {
    it("returns devnet config by default", async () => {
      vi.stubEnv("NEXT_PUBLIC_SOLANA_RPC_URL", "https://api.devnet.solana.com");
      vi.stubEnv("NEXT_PUBLIC_HELIUS_API_KEY", "");

      const { getLightConfig } = await import("../../lib/solana-adapter");
      const config = getLightConfig();

      expect(config.cluster).toBe("devnet");
      expect(config.knownMints.USDC).toBe(
        "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
      );
    });

    it("returns mainnet config when RPC URL contains mainnet", async () => {
      vi.stubEnv(
        "NEXT_PUBLIC_SOLANA_RPC_URL",
        "https://mainnet.helius-rpc.com"
      );
      vi.stubEnv("NEXT_PUBLIC_HELIUS_API_KEY", "test-api-key");

      const { getLightConfig } = await import("../../lib/solana-adapter");
      const config = getLightConfig();

      expect(config.cluster).toBe("mainnet-beta");
      expect(config.knownMints.USDC).toBe(
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
      );
    });

    it("uses Helius RPC when API key is provided", async () => {
      vi.stubEnv("NEXT_PUBLIC_SOLANA_RPC_URL", "https://api.devnet.solana.com");
      vi.stubEnv("NEXT_PUBLIC_HELIUS_API_KEY", "test-api-key");

      const { getLightConfig } = await import("../../lib/solana-adapter");
      const config = getLightConfig();

      expect(config.compressionRpcEndpoint).toContain("helius-rpc.com");
      expect(config.compressionRpcEndpoint).toContain("api-key=test-api-key");
    });

    it("falls back to base RPC when no API key", async () => {
      vi.stubEnv("NEXT_PUBLIC_SOLANA_RPC_URL", "https://api.devnet.solana.com");
      vi.stubEnv("NEXT_PUBLIC_HELIUS_API_KEY", "");

      const { getLightConfig } = await import("../../lib/solana-adapter");
      const config = getLightConfig();

      expect(config.compressionRpcEndpoint).toBe(
        "https://api.devnet.solana.com"
      );
    });

    it("returns localnet config for localhost URLs", async () => {
      vi.stubEnv("NEXT_PUBLIC_SOLANA_RPC_URL", "http://localhost:8899");
      vi.stubEnv("NEXT_PUBLIC_HELIUS_API_KEY", "");

      const { getLightConfig } = await import("../../lib/solana-adapter");
      const config = getLightConfig();

      expect(config.cluster).toBe("localnet");
    });
  });

  describe("getCluster", () => {
    it("returns devnet by default", async () => {
      vi.stubEnv("NEXT_PUBLIC_SOLANA_RPC_URL", "");

      const { getCluster } = await import("../../lib/solana-adapter");
      const cluster = getCluster();

      expect(cluster).toBe("devnet");
    });

    it("detects mainnet from RPC URL", async () => {
      vi.stubEnv("NEXT_PUBLIC_SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com");

      const { getCluster } = await import("../../lib/solana-adapter");
      const cluster = getCluster();

      expect(cluster).toBe("mainnet-beta");
    });

    it("detects localnet from 127.0.0.1", async () => {
      vi.stubEnv("NEXT_PUBLIC_SOLANA_RPC_URL", "http://127.0.0.1:8899");

      const { getCluster } = await import("../../lib/solana-adapter");
      const cluster = getCluster();

      expect(cluster).toBe("localnet");
    });
  });
});
