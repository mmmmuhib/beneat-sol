import { describe, it, expect, vi } from "vitest";

describe("Light Wallet Adapter", () => {
  describe("createLightWalletAdapter", () => {
    it("creates adapter with correct public key", async () => {
      const mockConnection = {
        getLatestBlockhash: vi.fn().mockResolvedValue({
          blockhash: "test-blockhash",
          lastValidBlockHeight: 1000,
        }),
        sendRawTransaction: vi.fn().mockResolvedValue("test-signature"),
        confirmTransaction: vi.fn().mockResolvedValue({ value: {} }),
      };

      const mockSignTransaction = vi.fn().mockImplementation((tx) => tx);

      const { createLightWalletAdapter } = await import(
        "../../lib/light-wallet-adapter"
      );

      const adapter = await createLightWalletAdapter(
        "11111111111111111111111111111111",
        mockSignTransaction,
        mockConnection as never
      );

      expect(adapter.publicKey.toBase58()).toBe(
        "11111111111111111111111111111111"
      );
    });

    it("signAndSendTransaction calls connection methods", async () => {
      const mockConnection = {
        getLatestBlockhash: vi.fn().mockResolvedValue({
          blockhash: "test-blockhash",
          lastValidBlockHeight: 1000,
        }),
        sendRawTransaction: vi.fn().mockResolvedValue("test-signature"),
        confirmTransaction: vi.fn().mockResolvedValue({ value: {} }),
      };

      const mockTransaction = {
        serialize: vi.fn().mockReturnValue(new Uint8Array([1, 2, 3])),
      };

      const mockSignTransaction = vi.fn().mockResolvedValue(mockTransaction);

      const { createLightWalletAdapter } = await import(
        "../../lib/light-wallet-adapter"
      );

      const adapter = await createLightWalletAdapter(
        "11111111111111111111111111111111",
        mockSignTransaction,
        mockConnection as never
      );

      const signature = await adapter.signAndSendTransaction(
        mockConnection as never,
        []
      );

      expect(mockConnection.getLatestBlockhash).toHaveBeenCalled();
      expect(mockConnection.sendRawTransaction).toHaveBeenCalled();
      expect(signature).toBe("test-signature");
    });
  });

  describe("Adapter functions", () => {
    it.skip("compressWithAdapter throws when no token pool found (requires integration test)", async () => {
      // This test requires integration with real Light Protocol SDK
      // Skip in unit tests - covered by integration tests
    });
  });
});
