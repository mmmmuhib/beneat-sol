"use client";

import { useEffect, useRef, useCallback } from "react";
import type { VaultEvent } from "../types/helius-webhook";
import { useWebhookStore } from "../stores/webhook-store";

interface UseHeliusEventsOptions {
  vaultAddress?: string;
  enabled?: boolean;
  onEvent?: (event: VaultEvent) => void;
}

export function useHeliusEvents(options: UseHeliusEventsOptions = {}) {
  const { vaultAddress, enabled = true, onEvent } = options;
  const eventSourceRef = useRef<EventSource | null>(null);
  const processWebhookEvent = useWebhookStore((s) => s.processWebhookEvent);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const params = new URLSearchParams();
    if (vaultAddress) {
      params.set("vault", vaultAddress);
    }

    const url = `/api/webhooks/helius/events${params.toString() ? `?${params}` : ""}`;
    const es = new EventSource(url);

    es.onmessage = (event) => {
      try {
        const vaultEvent = JSON.parse(event.data) as VaultEvent;
        processWebhookEvent(vaultEvent);
        onEvent?.(vaultEvent);
      } catch (err) {
        console.warn("[HeliusEvents] Failed to parse event:", err);
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;

      reconnectAttempts.current += 1;
      const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000);

      reconnectTimeoutRef.current = setTimeout(() => {
        if (enabled) {
          connect();
        }
      }, delay);
    };

    es.onopen = () => {
      reconnectAttempts.current = 0;
    };

    eventSourceRef.current = es;
  }, [vaultAddress, enabled, processWebhookEvent, onEvent]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [connect, enabled]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  return {
    disconnect,
    reconnect: connect,
  };
}
