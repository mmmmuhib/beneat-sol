import { NextRequest, NextResponse } from "next/server";
import {
  TeeMonitoringService,
  createTeeMonitoringService,
  MonitoredOrder,
} from "@/app/lib/tee-monitoring-service";

let monitoringService: TeeMonitoringService | null = null;
let serviceStartTime: number | null = null;

const executionLog: Array<{
  timestamp: number;
  orderPubkey: string;
  signature: string;
  status: "success" | "error";
  error?: string;
}> = [];

function getService(): TeeMonitoringService {
  if (!monitoringService) {
    monitoringService = createTeeMonitoringService({
      pollIntervalMs: parseInt(process.env.CRANK_POLL_INTERVAL_MS || "2000", 10),
      teePrivateKey: process.env.TEE_PRIVATE_KEY,
      erRpcUrl: process.env.MAGICBLOCK_ER_RPC || "https://devnet.magicblock.app",
      onOrderTriggered: (order: MonitoredOrder, signature: string) => {
        executionLog.push({
          timestamp: Date.now(),
          orderPubkey: order.pubkey.toBase58(),
          signature,
          status: "success",
        });
        if (executionLog.length > 100) {
          executionLog.shift();
        }
      },
      onOrderError: (order: MonitoredOrder, error: Error) => {
        executionLog.push({
          timestamp: Date.now(),
          orderPubkey: order.pubkey.toBase58(),
          signature: "",
          status: "error",
          error: error.message,
        });
        if (executionLog.length > 100) {
          executionLog.shift();
        }
      },
      onLog: (message: string) => {
        console.log(`[Crank] ${message}`);
      },
    });
  }
  return monitoringService;
}

export async function GET(request: NextRequest) {
  const service = getService();
  const orders = service.getMonitoredOrders();

  const status = {
    isRunning: serviceStartTime !== null,
    startTime: serviceStartTime,
    uptimeMs: serviceStartTime ? Date.now() - serviceStartTime : 0,
    monitoredOrderCount: orders.length,
    orders: orders.map((o) => ({
      pubkey: o.pubkey.toBase58(),
      owner: o.owner.toBase58(),
      status: o.status,
      feedId: Buffer.from(o.feedId).toString("hex"),
      createdAt: o.createdAt,
      hasDecryptedData: !!o.decryptedOrder,
    })),
    recentExecutions: executionLog.slice(-10),
  };

  return NextResponse.json(status);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, orderPubkey } = body;

  const service = getService();

  switch (action) {
    case "start": {
      if (serviceStartTime !== null) {
        return NextResponse.json(
          { error: "Service is already running" },
          { status: 400 }
        );
      }

      if (!process.env.TEE_PRIVATE_KEY) {
        return NextResponse.json(
          { error: "TEE_PRIVATE_KEY environment variable not set" },
          { status: 500 }
        );
      }

      try {
        await service.start();
        serviceStartTime = Date.now();
        return NextResponse.json({
          success: true,
          message: "Monitoring service started",
          startTime: serviceStartTime,
        });
      } catch (error) {
        return NextResponse.json(
          {
            error: "Failed to start service",
            details: error instanceof Error ? error.message : "Unknown error",
          },
          { status: 500 }
        );
      }
    }

    case "stop": {
      if (serviceStartTime === null) {
        return NextResponse.json(
          { error: "Service is not running" },
          { status: 400 }
        );
      }

      service.stop();
      const uptimeMs = Date.now() - serviceStartTime;
      serviceStartTime = null;

      return NextResponse.json({
        success: true,
        message: "Monitoring service stopped",
        uptimeMs,
      });
    }

    case "add-order": {
      if (!orderPubkey) {
        return NextResponse.json(
          { error: "orderPubkey is required" },
          { status: 400 }
        );
      }

      const added = await service.addOrder(orderPubkey);
      return NextResponse.json({
        success: added,
        message: added
          ? `Order ${orderPubkey} added to monitoring`
          : `Failed to add order ${orderPubkey}`,
      });
    }

    case "remove-order": {
      if (!orderPubkey) {
        return NextResponse.json(
          { error: "orderPubkey is required" },
          { status: 400 }
        );
      }

      const removed = service.removeOrder(orderPubkey);
      return NextResponse.json({
        success: removed,
        message: removed
          ? `Order ${orderPubkey} removed from monitoring`
          : `Order ${orderPubkey} was not being monitored`,
      });
    }

    default:
      return NextResponse.json(
        {
          error: "Invalid action",
          validActions: ["start", "stop", "add-order", "remove-order"],
        },
        { status: 400 }
      );
  }
}
