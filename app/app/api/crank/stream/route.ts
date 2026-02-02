import { NextRequest } from "next/server";
import {
  TeeMonitoringService,
  createTeeMonitoringService,
  MonitoredOrder,
} from "@/app/lib/tee-monitoring-service";

let sharedService: TeeMonitoringService | null = null;

const eventListeners = new Set<(event: string, data: unknown) => void>();

function getOrCreateService(): TeeMonitoringService {
  if (!sharedService) {
    sharedService = createTeeMonitoringService({
      pollIntervalMs: parseInt(process.env.CRANK_POLL_INTERVAL_MS || "2000", 10),
      teePrivateKey: process.env.TEE_PRIVATE_KEY,
      erRpcUrl: process.env.MAGICBLOCK_ER_RPC || "https://devnet.magicblock.app",
      onOrderTriggered: (order: MonitoredOrder, signature: string) => {
        broadcastEvent("order-triggered", {
          orderPubkey: order.pubkey.toBase58(),
          owner: order.owner.toBase58(),
          signature,
          timestamp: Date.now(),
        });
      },
      onOrderError: (order: MonitoredOrder, error: Error) => {
        broadcastEvent("order-error", {
          orderPubkey: order.pubkey.toBase58(),
          owner: order.owner.toBase58(),
          error: error.message,
          timestamp: Date.now(),
        });
      },
      onLog: (message: string) => {
        broadcastEvent("log", { message, timestamp: Date.now() });
      },
    });
  }
  return sharedService;
}

function broadcastEvent(event: string, data: unknown) {
  for (const listener of eventListeners) {
    listener(event, data);
  }
}

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const listener = (event: string, data: unknown) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      eventListeners.add(listener);

      const pingMessage = `event: ping\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`;
      controller.enqueue(encoder.encode(pingMessage));

      const service = getOrCreateService();
      const orders = service.getMonitoredOrders();

      const statusMessage = `event: status\ndata: ${JSON.stringify({
        connectedAt: Date.now(),
        monitoredOrderCount: orders.length,
        orders: orders.map((o) => ({
          pubkey: o.pubkey.toBase58(),
          owner: o.owner.toBase58(),
          status: o.status,
          hasDecryptedData: !!o.decryptedOrder,
        })),
      })}\n\n`;
      controller.enqueue(encoder.encode(statusMessage));

      const pingInterval = setInterval(() => {
        try {
          const ping = `event: ping\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`;
          controller.enqueue(encoder.encode(ping));
        } catch {
          clearInterval(pingInterval);
          eventListeners.delete(listener);
        }
      }, 30000);

      request.signal.addEventListener("abort", () => {
        clearInterval(pingInterval);
        eventListeners.delete(listener);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
