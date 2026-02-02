import type { VaultEvent } from "../../../types/helius-webhook";

type SSEClient = {
  id: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  vaultAddress?: string;
};

const clients = new Map<string, SSEClient>();

const encoder = new TextEncoder();

export function addClient(
  id: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  vaultAddress?: string
): void {
  clients.set(id, { id, controller, vaultAddress });
}

export function removeClient(id: string): void {
  clients.delete(id);
}

export function broadcastVaultEvent(event: VaultEvent): void {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  const encoded = encoder.encode(data);

  for (const client of clients.values()) {
    try {
      client.controller.enqueue(encoded);
    } catch {
      clients.delete(client.id);
    }
  }
}

export function getClientCount(): number {
  return clients.size;
}
