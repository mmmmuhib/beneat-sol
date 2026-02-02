import { NextRequest } from "next/server";
import { addClient, removeClient, getClientCount } from "../sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const clientId = crypto.randomUUID();
  const vaultAddress = request.nextUrl.searchParams.get("vault") ?? undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      addClient(clientId, controller, vaultAddress);

      const keepalive = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
          removeClient(clientId);
        }
      }, 30000);

      request.signal.addEventListener("abort", () => {
        clearInterval(keepalive);
        removeClient(clientId);
      });

      console.log(
        `[Helius SSE] Client connected: ${clientId} (total: ${getClientCount()})`
      );
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
