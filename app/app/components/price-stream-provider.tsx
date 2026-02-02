"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  PropsWithChildren,
} from "react";
import {
  useMagicBlockPrices,
  PYTH_LAZER_FEEDS,
} from "../hooks/use-magicblock-prices";
import { usePriceStore, type ConnectionStatus } from "../stores/price-store";

const FALLBACK_PRICES: Record<string, number> = {
  SOL: 178.50,
  BTC: 97500.00,
  ETH: 3450.00,
};

interface PriceStreamContextValue {
  connectionStatus: ConnectionStatus;
  isStreaming: boolean;
  subscribedTokens: string[];
  subscribeToToken: (token: string) => void;
  unsubscribeFromToken: (token: string) => void;
}

const PriceStreamContext = createContext<PriceStreamContextValue | null>(null);

export function usePriceStream(): PriceStreamContextValue {
  const context = useContext(PriceStreamContext);
  if (!context) {
    throw new Error("usePriceStream must be used within PriceStreamProvider");
  }
  return context;
}

export function PriceStreamProvider({ children }: PropsWithChildren) {
  const { connect, disconnect, subscribe, unsubscribe, subscribedTokens } =
    useMagicBlockPrices();
  const connectionStatus = usePriceStore((state) => state.connectionStatus);
  const setPriceWithSource = usePriceStore((state) => state.setPriceWithSource);
  const prices = usePriceStore((state) => state.prices);
  const subscribedTokensRef = useRef<string[]>([]);
  const fallbackSeededRef = useRef(false);

  const isStreaming = connectionStatus === "connected";

  useEffect(() => {
    if (!fallbackSeededRef.current) {
      for (const [token, price] of Object.entries(FALLBACK_PRICES)) {
        if (prices[token] === undefined) {
          setPriceWithSource(token, price, "mock");
        }
      }
      fallbackSeededRef.current = true;
    }
  }, [setPriceWithSource, prices]);

  useEffect(() => {
    if (connectionStatus === "error") {
      for (const [token, price] of Object.entries(FALLBACK_PRICES)) {
        setPriceWithSource(token, price, "mock");
      }
    }
  }, [connectionStatus, setPriceWithSource]);

  useEffect(() => {
    const initialTokens = Object.keys(PYTH_LAZER_FEEDS);
    subscribedTokensRef.current = initialTokens;
    subscribe(initialTokens);
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect, subscribe]);

  const subscribeToToken = useCallback(
    (token: string) => {
      if (!subscribedTokensRef.current.includes(token)) {
        subscribedTokensRef.current = [...subscribedTokensRef.current, token];
      }
      if (PYTH_LAZER_FEEDS[token]) {
        subscribe([token]);
      }
    },
    [subscribe]
  );

  const unsubscribeFromToken = useCallback(
    (token: string) => {
      subscribedTokensRef.current = subscribedTokensRef.current.filter(
        (t) => t !== token
      );
      unsubscribe([token]);
    },
    [unsubscribe]
  );

  return (
    <PriceStreamContext.Provider
      value={{
        connectionStatus,
        isStreaming,
        subscribedTokens: subscribedTokensRef.current,
        subscribeToToken,
        unsubscribeFromToken,
      }}
    >
      {children}
    </PriceStreamContext.Provider>
  );
}
