"use client";

import dynamic from "next/dynamic";

const TradeTerminal = dynamic(
  () => import("../components/trade-terminal").then((mod) => mod.TradeTerminal),
  { ssr: false }
);

export default function TradePage() {
  return <TradeTerminal />;
}
