import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";

const mockBroadcast = vi.fn();
vi.mock("../../api/webhooks/helius/sse", () => ({
  broadcastVaultEvent: mockBroadcast,
}));

describe("Helius Webhook Route", () => {
  beforeEach(() => {
    vi.resetModules();
    mockBroadcast.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function createSignature(payload: string, secret: string): string {
    return createHmac("sha256", secret).update(payload).digest("hex");
  }

  describe("signature verification", () => {
    it("rejects request with invalid signature", async () => {
      vi.stubEnv("HELIUS_WEBHOOK_SECRET", "test-secret");

      const { POST } = await import("../../api/webhooks/helius/route");

      const payload = JSON.stringify({
        signature: "test-sig",
        timestamp: Math.floor(Date.now() / 1000),
        type: "SWAP",
        description: "Test",
        feePayer: "test",
        fee: 5000,
        slot: 1,
        accountData: [],
        events: {},
      });

      const request = new Request("http://localhost/api/webhooks/helius", {
        method: "POST",
        body: payload,
        headers: {
          "Content-Type": "application/json",
          "helius-signature": "invalid-signature",
        },
      });

      const response = await POST(request as never);
      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error).toBe("Invalid signature");
    });

    it("accepts request with valid signature", async () => {
      const secret = "test-secret";
      vi.stubEnv("HELIUS_WEBHOOK_SECRET", secret);

      const { POST } = await import("../../api/webhooks/helius/route");

      const payload = JSON.stringify({
        signature: "test-sig",
        timestamp: Math.floor(Date.now() / 1000),
        type: "SWAP",
        description: "lockout triggered",
        feePayer: "test",
        fee: 5000,
        slot: 1,
        accountData: [],
        events: {},
      });

      const signature = createSignature(payload, secret);

      const request = new Request("http://localhost/api/webhooks/helius", {
        method: "POST",
        body: payload,
        headers: {
          "Content-Type": "application/json",
          "helius-signature": signature,
        },
      });

      const response = await POST(request as never);
      expect(response.status).toBe(200);
    });

    it("rejects request with missing signature when secret is configured", async () => {
      vi.stubEnv("HELIUS_WEBHOOK_SECRET", "test-secret");

      const { POST } = await import("../../api/webhooks/helius/route");

      const payload = JSON.stringify({
        signature: "test-sig",
        timestamp: Math.floor(Date.now() / 1000),
        type: "SWAP",
        description: "Test",
        feePayer: "test",
        fee: 5000,
        slot: 1,
        accountData: [],
        events: {},
      });

      const request = new Request("http://localhost/api/webhooks/helius", {
        method: "POST",
        body: payload,
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request as never);
      expect(response.status).toBe(401);
    });
  });

  describe("auth token fallback", () => {
    it("accepts valid bearer token when no secret configured", async () => {
      vi.stubEnv("HELIUS_WEBHOOK_AUTH_TOKEN", "my-token");

      const { POST } = await import("../../api/webhooks/helius/route");

      const payload = JSON.stringify({
        signature: "test-sig",
        timestamp: Math.floor(Date.now() / 1000),
        type: "SWAP",
        description: "lockout",
        feePayer: "test",
        fee: 5000,
        slot: 1,
        accountData: [],
        events: {},
      });

      const request = new Request("http://localhost/api/webhooks/helius", {
        method: "POST",
        body: payload,
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer my-token",
        },
      });

      const response = await POST(request as never);
      expect(response.status).toBe(200);
    });

    it("rejects invalid bearer token", async () => {
      vi.stubEnv("HELIUS_WEBHOOK_AUTH_TOKEN", "correct-token");

      const { POST } = await import("../../api/webhooks/helius/route");

      const payload = JSON.stringify({
        signature: "test-sig",
        timestamp: Math.floor(Date.now() / 1000),
        type: "SWAP",
        description: "Test",
        feePayer: "test",
        fee: 5000,
        slot: 1,
        accountData: [],
        events: {},
      });

      const request = new Request("http://localhost/api/webhooks/helius", {
        method: "POST",
        body: payload,
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer wrong-token",
        },
      });

      const response = await POST(request as never);
      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error).toBe("Unauthorized");
    });
  });

  describe("timestamp validation", () => {
    it("rejects stale events", async () => {
      const { POST } = await import("../../api/webhooks/helius/route");

      const staleTimestamp = Math.floor(Date.now() / 1000) - 600;

      const payload = JSON.stringify({
        signature: "stale-sig",
        timestamp: staleTimestamp,
        type: "SWAP",
        description: "lockout triggered",
        feePayer: "test",
        fee: 5000,
        slot: 1,
        accountData: [],
        events: {},
      });

      const request = new Request("http://localhost/api/webhooks/helius", {
        method: "POST",
        body: payload,
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request as never);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.processed).toBe(0);
    });
  });

  describe("event parsing", () => {
    it("parses lockout events and broadcasts", async () => {
      const { POST } = await import("../../api/webhooks/helius/route");

      const payload = JSON.stringify({
        signature: "lockout-sig",
        timestamp: Math.floor(Date.now() / 1000),
        type: "UNKNOWN",
        description: "Lockout triggered for vault",
        feePayer: "user123",
        fee: 5000,
        slot: 1,
        accountData: [],
        events: {},
      });

      const request = new Request("http://localhost/api/webhooks/helius", {
        method: "POST",
        body: payload,
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request as never);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.processed).toBe(1);
      expect(data.events[0].type).toBe("LOCKOUT_TRIGGERED");

      expect(mockBroadcast).toHaveBeenCalledWith(
        expect.objectContaining({ type: "LOCKOUT_TRIGGERED" })
      );
    });

    it("handles batch webhook payloads", async () => {
      const { POST } = await import("../../api/webhooks/helius/route");

      const now = Math.floor(Date.now() / 1000);
      const payload = JSON.stringify([
        {
          signature: "sig1",
          timestamp: now,
          type: "SWAP",
          description: "deposit funds",
          feePayer: "user1",
          fee: 5000,
          slot: 1,
          accountData: [],
          events: {},
        },
        {
          signature: "sig2",
          timestamp: now,
          type: "SWAP",
          description: "withdraw funds",
          feePayer: "user2",
          fee: 5000,
          slot: 2,
          accountData: [],
          events: {},
        },
      ]);

      const request = new Request("http://localhost/api/webhooks/helius", {
        method: "POST",
        body: payload,
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request as never);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.processed).toBe(2);
    });
  });

  describe("error handling", () => {
    it("returns 500 on malformed JSON", async () => {
      const { POST } = await import("../../api/webhooks/helius/route");

      const request = new Request("http://localhost/api/webhooks/helius", {
        method: "POST",
        body: "not valid json",
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request as never);
      expect(response.status).toBe(500);

      const data = await response.json();
      expect(data.error).toBe("Failed to process webhook");
    });
  });
});
