"use client";

import { usePriceStore, type ConnectionStatus } from "../stores/price-store";
import { usePriceStream } from "./price-stream-provider";

interface MarketsSidebarProps {
  selectedMarket: string;
  onSelectMarket: (market: string) => void;
  className?: string;
}

function StreamingIndicator({
  isStreaming,
  connectionStatus,
}: {
  isStreaming: boolean;
  connectionStatus: ConnectionStatus;
}) {
  if (isStreaming) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
        <span className="text-bloomberg-label text-accent">LIVE</span>
      </div>
    );
  }

  if (connectionStatus === "connecting" || connectionStatus === "reconnecting") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
        <span className="text-bloomberg-label text-accent">
          {connectionStatus === "connecting" ? "CONNECTING" : "RECONNECTING"}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full bg-accent" />
      <span className="text-bloomberg-label text-muted">POLLING</span>
    </div>
  );
}

const MARKETS = [
  { symbol: "SOL", name: "Solana" },
  { symbol: "BTC", name: "Bitcoin" },
  { symbol: "ETH", name: "Ethereum" },
];

export function MarketsSidebar({
  selectedMarket,
  onSelectMarket,
  className = "",
}: MarketsSidebarProps) {
  const prices = usePriceStore((state) => state.prices);
  const { isStreaming, connectionStatus } = usePriceStream();

  return (
    <div className={`border-bloomberg bg-bloomberg-secondary ${className}`}>
      <div className="border-bottom px-4 py-3 flex items-center justify-between">
        <span className="text-bloomberg-label">MARKETS</span>
        <StreamingIndicator isStreaming={isStreaming} connectionStatus={connectionStatus} />
      </div>

      <ul>
        {MARKETS.map((market) => {
          const price = prices[market.symbol];
          const isSelected = selectedMarket === market.symbol;

          return (
            <li
              key={market.symbol}
              onClick={() => onSelectMarket(market.symbol)}
              className={`
                flex items-center justify-between px-4 py-3 cursor-pointer
                ${isSelected ? 'border-l-4 border-accent bg-bloomberg-tertiary' : 'border-l-4 border-transparent hover:bg-bloomberg-tertiary'}
              `}
            >
              <div>
                <span className="text-bloomberg-label">{market.symbol}</span>
                <span className="text-bloomberg-label text-muted ml-2">{market.name}</span>
              </div>
              <span className={`text-bloomberg-value ${isSelected ? 'text-accent' : ''}`}>
                {price ? `$${price.toFixed(2)}` : "—"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
