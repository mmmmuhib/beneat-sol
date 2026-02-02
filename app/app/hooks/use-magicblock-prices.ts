"use client";

import { useRef, useCallback, useEffect } from "react";
import { usePriceStore } from "../stores/price-store";

export const MAGICBLOCK_WS_ENDPOINT = "wss://devnet.magicblock.app";

export const PYTH_LAZER_FEEDS: Record<string, { address: string; exponent: number }> = {
  SOL: { address: "ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu", exponent: -8 },
  BTC: { address: "71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr", exponent: -8 },
  ETH: { address: "5vaYr1hpv8yrSpu8w3K95x22byYxUJCCNCSYJtqVWPvG", exponent: -8 },
};

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

interface ReconnectConfig {
  initialDelay: number;
  maxDelay: number;
  multiplier: number;
  maxAttempts: number;
}

const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  initialDelay: 1000,
  maxDelay: 30000,
  multiplier: 1.5,
  maxAttempts: 10,
};

const PYTH_LAZER_PRICE_OFFSET = 73;

function parsePythLazerPrice(data: string): bigint | null {
  try {
    const buffer = Buffer.from(data, "base64");
    if (buffer.length < PYTH_LAZER_PRICE_OFFSET + 8) return null;

    return buffer.readBigUInt64LE(PYTH_LAZER_PRICE_OFFSET);
  } catch {
    return null;
  }
}

export interface UseMagicBlockPricesReturn {
  connect: () => void;
  disconnect: () => void;
  subscribe: (tokens: string[]) => void;
  unsubscribe: (tokens: string[]) => void;
  subscribedTokens: string[];
}

export function useMagicBlockPrices(): UseMagicBlockPricesReturn {
  const { setPriceWithSource, setConnectionStatus } = usePriceStore();

  const wsRef = useRef<WebSocket | null>(null);
  const subscriptionsRef = useRef<Map<string, number>>(new Map());
  const tokenToSubIdRef = useRef<Map<number, string>>(new Map());
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const subscribedTokensRef = useRef<string[]>([]);
  const requestIdRef = useRef(1);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(
    (config: ReconnectConfig = DEFAULT_RECONNECT_CONFIG) => {
      if (reconnectAttemptRef.current >= config.maxAttempts) {
        console.error(
          "[MagicBlock] Max reconnection attempts reached, activating fallback"
        );
        setConnectionStatus("error");
        return;
      }

      const delay = Math.min(
        config.initialDelay *
          Math.pow(config.multiplier, reconnectAttemptRef.current),
        config.maxDelay
      );

      reconnectAttemptRef.current++;
      setConnectionStatus("reconnecting");

      console.log(
        `[MagicBlock] Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current}/${config.maxAttempts})`
      );

      reconnectTimeoutRef.current = setTimeout(() => {
        connectWebSocket();
      }, delay);
    },
    [setConnectionStatus]
  );

  const subscribeToAccount = useCallback(
    (token: string) => {
      const ws = wsRef.current;
      const feed = PYTH_LAZER_FEEDS[token];

      if (!ws || ws.readyState !== WebSocket.OPEN || !feed) {
        return;
      }

      if (subscriptionsRef.current.has(token)) {
        return;
      }

      const requestId = requestIdRef.current++;
      const message = {
        jsonrpc: "2.0",
        id: requestId,
        method: "accountSubscribe",
        params: [
          feed.address,
          {
            encoding: "base64",
            commitment: "processed",
          },
        ],
      };

      ws.send(JSON.stringify(message));
      subscriptionsRef.current.set(token, requestId);
    },
    []
  );

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);

        if (message.id !== undefined && message.result !== undefined) {
          for (const [token, reqId] of subscriptionsRef.current.entries()) {
            if (reqId === message.id) {
              tokenToSubIdRef.current.set(message.result, token);
              subscriptionsRef.current.set(token, message.result);
              break;
            }
          }
          return;
        }

        if (message.method === "accountNotification") {
          const subId = message.params?.subscription;
          const token = tokenToSubIdRef.current.get(subId);

          if (!token) return;

          const feed = PYTH_LAZER_FEEDS[token];
          if (!feed) return;

          const accountData = message.params?.result?.value?.data?.[0];
          if (!accountData) return;

          const rawPrice = parsePythLazerPrice(accountData);
          if (!rawPrice) return;

          const price = Number(rawPrice) * Math.pow(10, feed.exponent);
          if (price > 0) {
            console.log(`[MagicBlock] ${token}: $${price.toFixed(2)}`);
            setPriceWithSource(token, price, "magicblock");
          }
        }
      } catch (err) {
        console.error("[MagicBlock] Error parsing message:", err);
      }
    },
    [setPriceWithSource]
  );

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionStatus("connecting");

    try {
      const ws = new WebSocket(MAGICBLOCK_WS_ENDPOINT);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[MagicBlock] WebSocket connected");
        setConnectionStatus("connected");
        reconnectAttemptRef.current = 0;
        clearReconnectTimeout();

        for (const token of subscribedTokensRef.current) {
          subscribeToAccount(token);
        }
      };

      ws.onmessage = handleMessage;

      ws.onerror = (error) => {
        console.error("[MagicBlock] WebSocket error:", error);
      };

      ws.onclose = (event) => {
        console.log(`[MagicBlock] WebSocket closed: ${event.code}`);
        wsRef.current = null;
        subscriptionsRef.current.clear();
        tokenToSubIdRef.current.clear();

        if (event.code !== 1000) {
          scheduleReconnect();
        } else {
          setConnectionStatus("disconnected");
        }
      };
    } catch (err) {
      console.error("[MagicBlock] Failed to create WebSocket:", err);
      setConnectionStatus("error");
    }
  }, [
    setConnectionStatus,
    clearReconnectTimeout,
    handleMessage,
    scheduleReconnect,
    subscribeToAccount,
  ]);

  const connect = useCallback(() => {
    connectWebSocket();
  }, [connectWebSocket]);

  const disconnect = useCallback(() => {
    clearReconnectTimeout();
    reconnectAttemptRef.current = 0;

    if (wsRef.current) {
      const ws = wsRef.current;
      wsRef.current = null;

      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000);
      } else if (ws.readyState === WebSocket.CONNECTING) {
        ws.onopen = () => ws.close(1000);
        ws.onerror = () => {};
        ws.onclose = () => {};
      }
    }

    subscriptionsRef.current.clear();
    tokenToSubIdRef.current.clear();
    setConnectionStatus("disconnected");
  }, [clearReconnectTimeout, setConnectionStatus]);

  const subscribe = useCallback(
    (tokens: string[]) => {
      const newTokens = tokens.filter(
        (t) => !subscribedTokensRef.current.includes(t)
      );
      subscribedTokensRef.current = [
        ...new Set([...subscribedTokensRef.current, ...tokens]),
      ];

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        for (const token of newTokens) {
          subscribeToAccount(token);
        }
      }
    },
    [subscribeToAccount]
  );

  const unsubscribe = useCallback((tokens: string[]) => {
    subscribedTokensRef.current = subscribedTokensRef.current.filter(
      (t) => !tokens.includes(t)
    );

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    for (const token of tokens) {
      const subId = subscriptionsRef.current.get(token);
      if (subId !== undefined) {
        const message = {
          jsonrpc: "2.0",
          id: requestIdRef.current++,
          method: "accountUnsubscribe",
          params: [subId],
        };
        ws.send(JSON.stringify(message));
        subscriptionsRef.current.delete(token);
        tokenToSubIdRef.current.delete(subId);
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      clearReconnectTimeout();
      if (wsRef.current) {
        const ws = wsRef.current;
        wsRef.current = null;

        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1000);
        } else if (ws.readyState === WebSocket.CONNECTING) {
          ws.onopen = () => ws.close(1000);
          ws.onerror = () => {};
          ws.onclose = () => {};
        }
      }
    };
  }, [clearReconnectTimeout]);

  return {
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    subscribedTokens: subscribedTokensRef.current,
  };
}
