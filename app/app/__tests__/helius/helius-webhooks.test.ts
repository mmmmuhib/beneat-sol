import { describe, it, expect, vi, beforeEach } from "vitest";

describe("HeliusWebhooks", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_HELIUS_API_KEY", "test-api-key");
    vi.resetModules();
  });

  describe("createWebhook", () => {
    it("creates webhook for vault account monitoring", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            webhookId: "webhook-123",
            url: "https://myapp.com/api/webhooks/helius",
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { createVaultWebhook } = await import("../../lib/helius-webhooks");
      const result = await createVaultWebhook({
        vaultAddress: "vault-pda-address",
        webhookUrl: "https://myapp.com/api/webhooks/helius",
        authToken: "secret-token",
      });

      expect(result.webhookId).toBe("webhook-123");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/v0/webhooks"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("vault-pda-address"),
        })
      );
    });

    it("throws on duplicate webhook URL", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        text: () => Promise.resolve("Webhook already exists for this URL"),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { createVaultWebhook } = await import("../../lib/helius-webhooks");

      await expect(
        createVaultWebhook({
          vaultAddress: "vault-pda",
          webhookUrl: "https://existing.com/webhook",
        })
      ).rejects.toThrow("Failed to create webhook: 409");
    });

    it("throws on invalid vault address", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve("Invalid account address"),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { createVaultWebhook } = await import("../../lib/helius-webhooks");

      await expect(
        createVaultWebhook({
          vaultAddress: "invalid-address",
          webhookUrl: "https://app.com/webhook",
        })
      ).rejects.toThrow("Failed to create webhook: 400");
    });
  });

  describe("deleteWebhook", () => {
    it("deletes webhook by ID", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { deleteWebhook } = await import("../../lib/helius-webhooks");
      const result = await deleteWebhook("webhook-123");

      expect(result).toBe(true);
    });

    it("returns false when webhook not found", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });
      vi.stubGlobal("fetch", mockFetch);

      const { deleteWebhook } = await import("../../lib/helius-webhooks");
      const result = await deleteWebhook("nonexistent-webhook");

      expect(result).toBe(false);
    });
  });

  describe("listWebhooks", () => {
    it("lists all webhooks", async () => {
      const mockWebhooks = [
        { webhookId: "wh-1", url: "https://app.com/wh1" },
        { webhookId: "wh-2", url: "https://app.com/wh2" },
      ];
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockWebhooks),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { listWebhooks } = await import("../../lib/helius-webhooks");
      const result = await listWebhooks();

      expect(result).toHaveLength(2);
    });

    it("throws on API error", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });
      vi.stubGlobal("fetch", mockFetch);

      const { listWebhooks } = await import("../../lib/helius-webhooks");

      await expect(listWebhooks()).rejects.toThrow("Failed to list webhooks: 500");
    });
  });
});
