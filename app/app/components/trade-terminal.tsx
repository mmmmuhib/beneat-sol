"use client";

import { useState } from "react";
import { useWalletConnection } from "@solana/react-hooks";
import { useDevMode } from "../hooks/use-dev-mode";
import { useDemoMode } from "../hooks/use-demo-mode";
import { useVault } from "../hooks/use-vault";
import { VaultStatusBar } from "./vault-status-bar";
import { MarketsSidebar } from "./markets-sidebar";
import { PriceChart } from "./price-chart";
import { PerpOrderForm } from "./perp-order-form";
import { PositionsPanel } from "./positions-panel";
import { PrivacyIndicator } from "./privacy-indicator";
import { LockoutBanner } from "./lockout-banner";
import { TriggerMonitorStatus } from "./trigger-monitor-status";
import { StatChangeToast } from "./stat-change-toast";
import {
  ErrorBoundary,
  ChartErrorFallback,
  PositionsErrorFallback,
  OrderFormErrorFallback,
} from "./error-boundary";

function ConnectWalletPrompt() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md border-bloomberg bg-bloomberg-secondary p-8 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center border-bloomberg bg-bloomberg-tertiary">
          <svg
            className="h-10 w-10 text-accent"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
            />
          </svg>
        </div>
        <h2 className="text-bloomberg-header">CONNECT YOUR WALLET</h2>
        <p className="mt-3 text-bloomberg-label leading-relaxed">
          CONNECT YOUR WALLET TO ACCESS THE PERPETUALS TRADING TERMINAL WITH
          PRIVACY-PRESERVING FEATURES.
        </p>
        <div className="mt-6 border-bloomberg bg-bloomberg-tertiary p-3">
          <p className="text-bloomberg-label text-muted">
            USE THE CONNECT BUTTON IN THE NAVIGATION BAR TO GET STARTED.
          </p>
        </div>
      </div>
    </div>
  );
}

function NoVaultPrompt() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md border-bloomberg bg-bloomberg-secondary p-8 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center border-bloomberg bg-bloomberg-tertiary">
          <svg
            className="h-10 w-10 text-accent"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>
        <h2 className="text-bloomberg-header">VAULT REQUIRED</h2>
        <p className="mt-3 text-bloomberg-label leading-relaxed">
          CREATE A VAULT WITH RISK RULES BEFORE YOU CAN TRADE. YOUR VAULT
          ENFORCES DAILY LIMITS AND PROTECTS YOUR CAPITAL.
        </p>
        <a
          href="/vault"
          className="mt-6 inline-flex items-center gap-2 border-bloomberg bg-bloomberg-tertiary px-6 py-3 text-bloomberg-label text-accent"
        >
          SET UP VAULT
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
        </a>
      </div>
    </div>
  );
}

function TradingTerminal() {
  const [selectedMarket, setSelectedMarket] = useState("SOL");
  const [chartKey, setChartKey] = useState(0);
  const [positionsKey, setPositionsKey] = useState(0);
  const [orderFormKey, setOrderFormKey] = useState(0);
  const { vault, isLocked, lockoutRemaining, unlock } = useVault();

  const lockoutUntil = vault?.lockoutUntil
    ? Number(vault.lockoutUntil)
    : 0;

  if (!vault) {
    return <NoVaultPrompt />;
  }

  return (
    <>
      {isLocked && lockoutRemaining > 0 && (
        <LockoutBanner
          lockoutUntil={lockoutUntil}
          onEmergencyUnlock={unlock}
        />
      )}

      <VaultStatusBar />

      <div className="flex flex-col lg:flex-row" style={{ height: "calc(100vh - 84px)" }}>
        {/* Left column: Markets + Trigger Monitor */}
        <div className="hidden lg:flex lg:w-[220px] lg:flex-col lg:border-r lg:border-[var(--border-color)]">
          <MarketsSidebar
            selectedMarket={selectedMarket}
            onSelectMarket={setSelectedMarket}
            className="flex-1"
          />
          <div className="border-t border-[var(--border-color)]">
            <TriggerMonitorStatus />
          </div>
        </div>

        {/* Center column: Chart + Positions + Ghost Orders */}
        <div className="flex flex-1 flex-col overflow-y-auto">
          {/* Mobile market selector */}
          <div className="lg:hidden border-bottom bg-bloomberg-secondary">
            <div className="flex">
              {["SOL", "BTC", "ETH"].map((market) => (
                <button
                  key={market}
                  onClick={() => setSelectedMarket(market)}
                  className={`flex-1 py-2 text-bloomberg-label text-center ${
                    selectedMarket === market
                      ? "border-b-2 border-[var(--accent-orange)] bg-bloomberg-tertiary text-accent"
                      : "hover:bg-bloomberg-tertiary"
                  }`}
                >
                  {selectedMarket === market ? `[${market}]` : market}
                </button>
              ))}
            </div>
          </div>

          <ErrorBoundary
            key={chartKey}
            fallback={<ChartErrorFallback onRetry={() => setChartKey((k) => k + 1)} />}
          >
            <PriceChart token={selectedMarket} className="flex-shrink-0" />
          </ErrorBoundary>

          <div className="flex-1 border-t border-[var(--border-color)] overflow-y-auto">
            <ErrorBoundary
              key={positionsKey}
              fallback={<PositionsErrorFallback onRetry={() => setPositionsKey((k) => k + 1)} />}
            >
              <PositionsPanel />
            </ErrorBoundary>
          </div>
        </div>

        {/* Right column: Order form */}
        <div className="lg:w-[320px] border-t lg:border-t-0 lg:border-l border-[var(--border-color)] overflow-y-auto bg-bloomberg-secondary">
          <ErrorBoundary
            key={orderFormKey}
            fallback={<OrderFormErrorFallback onRetry={() => setOrderFormKey((k) => k + 1)} />}
          >
            <PerpOrderForm token={selectedMarket} />
          </ErrorBoundary>

          <div className="lg:hidden border-t border-[var(--border-color)]">
            <TriggerMonitorStatus />
          </div>
        </div>
      </div>

      <PrivacyIndicator />
    </>
  );
}

export function TradeTerminal() {
  const { status } = useWalletConnection();
  const { isDevMode } = useDevMode();
  const { isDemoMode } = useDemoMode();

  const isConnected = status === "connected" || isDevMode || isDemoMode;

  return (
    <div className="min-h-screen pt-20">
      {isConnected ? <TradingTerminal /> : <ConnectWalletPrompt />}
      <StatChangeToast />
    </div>
  );
}
