import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import type { HeliusWebhookPayload, VaultEvent } from "../../../types/helius-webhook";
import { broadcastVaultEvent } from "./sse";

const WEBHOOK_AUTH_TOKEN = process.env.HELIUS_WEBHOOK_AUTH_TOKEN;
const WEBHOOK_SECRET = process.env.HELIUS_WEBHOOK_SECRET;
const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000; // 5 minutes

function verifyHeliusSignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) {
    return false;
  }

  try {
    const expectedSig = createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSig);

    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

function isTimestampValid(timestamp: number): boolean {
  const eventTime = timestamp * 1000;
  const now = Date.now();
  const age = now - eventTime;
  return age >= 0 && age <= MAX_TIMESTAMP_AGE_MS;
}

function parseVaultEvent(payload: HeliusWebhookPayload): VaultEvent | null {
  const description = payload.description.toLowerCase();

  if (description.includes("lockout") || description.includes("lock_vault")) {
    return {
      type: "LOCKOUT_TRIGGERED",
      signature: payload.signature,
      timestamp: payload.timestamp * 1000,
      data: {
        description: payload.description,
        feePayer: payload.feePayer,
      },
    };
  }

  if (description.includes("unlock") || description.includes("clear_lockout")) {
    return {
      type: "LOCKOUT_CLEARED",
      signature: payload.signature,
      timestamp: payload.timestamp * 1000,
      data: {
        description: payload.description,
      },
    };
  }

  if (description.includes("deposit")) {
    return {
      type: "DEPOSIT",
      signature: payload.signature,
      timestamp: payload.timestamp * 1000,
      data: {
        accountData: payload.accountData,
      },
    };
  }

  if (description.includes("withdraw")) {
    return {
      type: "WITHDRAWAL",
      signature: payload.signature,
      timestamp: payload.timestamp * 1000,
      data: {
        accountData: payload.accountData,
      },
    };
  }

  if (payload.events?.swap) {
    return {
      type: "TRADE",
      signature: payload.signature,
      timestamp: payload.timestamp * 1000,
      data: {
        swap: payload.events.swap,
      },
    };
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    if (WEBHOOK_SECRET) {
      const signature = request.headers.get("helius-signature");
      if (!verifyHeliusSignature(rawBody, signature, WEBHOOK_SECRET)) {
        console.warn("[Helius Webhook] Invalid signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    } else if (WEBHOOK_AUTH_TOKEN) {
      const authHeader = request.headers.get("authorization");
      if (authHeader !== `Bearer ${WEBHOOK_AUTH_TOKEN}`) {
        console.warn("[Helius Webhook] Invalid auth token");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const payload = JSON.parse(rawBody) as HeliusWebhookPayload | HeliusWebhookPayload[];

    const events = Array.isArray(payload) ? payload : [payload];

    const processedEvents: VaultEvent[] = [];

    for (const event of events) {
      if (!isTimestampValid(event.timestamp)) {
        console.warn(
          `[Helius Webhook] Stale event rejected: ${event.signature} (timestamp: ${event.timestamp})`
        );
        continue;
      }

      console.log(`[Helius Webhook] Received: ${event.type} - ${event.signature}`);

      const vaultEvent = parseVaultEvent(event);
      if (vaultEvent) {
        processedEvents.push(vaultEvent);
        console.log(`[Helius Webhook] Parsed vault event: ${vaultEvent.type}`);
        broadcastVaultEvent(vaultEvent);
      }
    }

    return NextResponse.json({
      success: true,
      processed: processedEvents.length,
      events: processedEvents,
    });
  } catch (err) {
    console.error("[Helius Webhook] Error processing webhook:", err);
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "healthy",
    service: "helius-webhook",
    timestamp: new Date().toISOString(),
  });
}
