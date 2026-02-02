"use client";

import { useState } from "react";
import Link from "next/link";
import { useWalletConnection } from "@solana/react-hooks";

function BeneatLogo() {
  return (
    <div className="relative">
      <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-3xl" />
      <div className="relative flex h-24 w-24 items-center justify-center rounded-2xl border border-primary/30 bg-card shadow-[0_0_100px_rgba(16,185,129,0.3)]">
        <svg
          width="48"
          height="48"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <g transform="translate(7, 8.5) scale(1)">
            <path
              d="M17.1635 11.1218C17.1833 11.1815 17.1833 11.2461 17.1635 11.3057C17.152 11.3653 17.1237 11.4203 17.082 11.4641L14.3854 14.2996C14.326 14.3608 14.255 14.4094 14.1764 14.4426C14.0977 14.4772 14.0126 14.4947 13.9267 14.4937H1.13749C1.07826 14.4942 1.02004 14.4784 0.969275 14.4477C0.918542 14.4132 0.878043 14.3655 0.852037 14.3098C0.834076 14.2533 0.834076 14.1926 0.852037 14.1361C0.862607 14.0773 0.889051 14.0225 0.928496 13.9777L3.63008 11.1423C3.6895 11.0811 3.76057 11.0324 3.83907 10.9992C3.91763 10.9642 4.00287 10.9467 4.08884 10.9481H16.8577C16.9192 10.947 16.9798 10.9648 17.0309 10.9992C17.0883 11.0229 17.1353 11.0664 17.1635 11.1218ZM14.3905 5.73697C14.3298 5.67739 14.2591 5.62895 14.1815 5.59395C14.1021 5.56176 14.0175 5.54451 13.9318 5.54286H1.13749C1.07752 5.54372 1.01899 5.5614 0.968544 5.59395C0.918094 5.62644 0.877734 5.67243 0.852037 5.72676C0.834406 5.78332 0.834406 5.84391 0.852037 5.90047C0.860621 5.9599 0.887327 6.01524 0.928496 6.05886L3.63008 8.8994C3.69082 8.95905 3.76157 9.00749 3.83907 9.04249C3.91839 9.07504 4.00312 9.09236 4.08884 9.09359H16.8577C16.9192 9.09474 16.9798 9.07691 17.0309 9.04249C17.0825 9.01238 17.122 8.96552 17.1431 8.90968C17.1692 8.85528 17.1779 8.79412 17.1678 8.73468C17.1578 8.67518 17.1295 8.62027 17.0871 8.57758L14.3905 5.73697ZM0.969275 3.64226C1.02004 3.67288 1.07826 3.68876 1.13749 3.68826H13.9318C14.0177 3.68919 14.1029 3.67173 14.1815 3.63716C14.26 3.60396 14.3311 3.55538 14.3905 3.49415L17.0871 0.658665C17.1288 0.614783 17.1571 0.559812 17.1686 0.500284C17.1862 0.443732 17.1862 0.383134 17.1686 0.326582C17.1475 0.270727 17.1079 0.223834 17.0564 0.193743C17.0053 0.159319 16.9448 0.141482 16.8832 0.142653H4.06845C3.98248 0.141281 3.89724 0.158715 3.81869 0.193743C3.74018 0.226946 3.66911 0.275585 3.60969 0.336794L0.913205 3.18246C0.870448 3.22565 0.841973 3.28092 0.831647 3.34085C0.813686 3.39734 0.813686 3.45807 0.831647 3.51456C0.864731 3.56918 0.912405 3.61345 0.969275 3.64226Z"
              fill="#10b981"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
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
  );
}

const BENEFITS = [
  "Analyze your trading patterns",
  "Set personalized risk limits",
  "Auto-lock when limits are breached",
  "Keep your capital safe from tilt",
] as const;

export function HomeContent() {
  const { connectors, connect, status } = useWalletConnection();
  const [showWalletMenu, setShowWalletMenu] = useState(false);

  const isConnected = status === "connected";

  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-x-clip">
      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col items-center justify-center px-6 py-16 text-center">
        <BeneatLogo />

        <h1 className="mt-8 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Protect Your Trading Capital
        </h1>

        <p className="mt-4 max-w-lg text-lg text-text-secondary">
          On-chain risk enforcement for disciplined Solana DeFi traders
        </p>

        <ul className="mt-10 space-y-3 text-left">
          {BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-start gap-3">
              <CheckIcon />
              <span className="text-foreground">{benefit}</span>
            </li>
          ))}
        </ul>

        <div className="mt-12 flex flex-col items-center gap-4">
          {!isConnected ? (
            <div className="relative">
              <button
                onClick={() => setShowWalletMenu(!showWalletMenu)}
                disabled={status === "connecting"}
                className="rounded-xl bg-primary px-8 py-4 text-lg font-semibold text-background transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Connect wallet"
                aria-expanded={showWalletMenu}
                aria-haspopup="true"
              >
                {status === "connecting" ? "Connecting..." : "Connect Wallet"}
              </button>

              {showWalletMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowWalletMenu(false)}
                    aria-hidden="true"
                  />
                  <div className="absolute left-1/2 top-full z-50 mt-3 w-64 -translate-x-1/2 rounded-xl border border-border bg-card p-2 shadow-lg">
                    <p className="px-3 py-2 text-sm text-text-secondary">
                      Select a wallet
                    </p>
                    {connectors.map((connector) => (
                      <button
                        key={connector.id}
                        onClick={() => {
                          connect(connector.id);
                          setShowWalletMenu(false);
                        }}
                        className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-left text-sm font-medium transition hover:bg-primary/10"
                      >
                        <span className="text-foreground">{connector.name}</span>
                        <span className="h-2 w-2 rounded-full bg-border" />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2">
                <span className="h-2 w-2 rounded-full bg-primary" />
                <span className="text-sm font-medium text-primary">
                  Wallet Connected
                </span>
              </div>

              <Link
                href="/analyze"
                className="group flex items-center gap-2 rounded-xl border border-primary bg-transparent px-8 py-4 text-lg font-semibold text-primary transition hover:bg-primary/10"
              >
                Analyze My Trading
                <ArrowRightIcon />
              </Link>
            </>
          )}
        </div>

        <p className="mt-16 text-sm text-text-muted">
          Your lockouts are public, but your P&L stays private.
        </p>
      </main>
    </div>
  );
}
