"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWalletConnection } from "@solana/react-hooks";
import { isHeliusDemoMode } from "../lib/helius";
import { useDemoMode } from "../hooks/use-demo-mode";

const NAV_LINKS = [
  { href: "/", label: "HOME", shortcut: "H" },
  { href: "/analyze", label: "ANALYZE", shortcut: "A" },
  { href: "/vault", label: "VAULT", shortcut: "V" },
  { href: "/trade", label: "TRADE", shortcut: "T" },
] as const;

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function useCurrentTime() {
  const [time, setTime] = useState<string>("");
  const [date, setDate] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
      setDate(
        now.toLocaleDateString("en-US", {
          month: "short",
          day: "2-digit",
        })
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return { time, date };
}

function Logo() {
  return (
    <span
      className="text-2xl font-bold text-accent select-none"
      aria-hidden="true"
    >
      ▌
    </span>
  );
}

function StatusIndicator({
  status,
  label,
}: {
  status: "online" | "warning" | "offline";
  label: string;
}) {
  const colors = {
    online: "bg-[var(--profit-green)]",
    warning: "bg-[var(--accent-orange)]",
    offline: "bg-[var(--loss-red)]",
  };

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`h-1.5 w-1.5 rounded-full ${colors[status]} animate-glow-pulse`}
      />
      <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </span>
    </div>
  );
}

function SystemClock() {
  const { time, date } = useCurrentTime();

  return (
    <div className="hidden items-center gap-3 border-l border-[var(--border-color)] pl-3 sm:flex">
      <div className="text-right">
        <div className="font-mono text-xs tabular-nums text-accent">
          {time || "--:--:--"}
        </div>
        <div className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
          {date || "---"}
        </div>
      </div>
    </div>
  );
}

function NetworkStatus() {
  const demoMode = isHeliusDemoMode();

  return (
    <div className="hidden items-center gap-3 border-l border-[var(--border-color)] pl-3 lg:flex">
      {demoMode && (
        <div className="flex items-center gap-1.5 rounded bg-[var(--accent-orange)]/10 px-2 py-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-orange)] animate-pulse" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--accent-orange)]">
            DEMO
          </span>
        </div>
      )}
      <StatusIndicator status="online" label="NET" />
      <StatusIndicator status={demoMode ? "warning" : "online"} label="RPC" />
    </div>
  );
}

function DemoModeBanner() {
  const { isDemoMode, isHydrated } = useDemoMode();
  
  if (!isHydrated || !isDemoMode) return null;
  
  return (
    <div className="bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-500 text-white">
      <div className="flex items-center justify-center gap-3 px-4 py-1.5">
        <svg className="h-3.5 w-3.5 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
        </svg>
        <span className="text-xs font-bold uppercase tracking-wider">Demo Mode</span>
        <span className="hidden text-xs text-purple-100 sm:inline">No SOL required - Transactions are simulated</span>
        <button 
          onClick={() => {
            localStorage.removeItem("beneat-demo-mode");
            window.location.reload();
          }}
          className="ml-2 text-xs underline hover:text-white/80"
        >
          Exit
        </button>
      </div>
    </div>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function WalletButton() {
  const { connectors, connect, disconnect, wallet, status } =
    useWalletConnection();
  const [showDropdown, setShowDropdown] = useState(false);

  const address = wallet?.account.address.toString();

  if (status === "connected" && address) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="group flex items-center gap-2 border border-bloomberg bg-bloomberg-tertiary px-3 py-1.5 text-xs font-medium transition-all hover:border-[var(--accent-orange)] hover:bg-bloomberg-tertiary"
          aria-label="Wallet options"
          aria-expanded={showDropdown}
          aria-haspopup="true"
        >
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-orange)] animate-glow-pulse" />
            <span className="text-[10px] uppercase tracking-wider text-bloomberg-label">
              WALLET
            </span>
          </span>
          <span className="border-l border-[var(--border-color)] pl-2 font-mono text-accent">
            {truncateAddress(address)}
          </span>
        </button>

        {showDropdown && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowDropdown(false)}
              aria-hidden="true"
            />
            <div className="absolute right-0 top-full z-50 mt-1 w-56 border-bloomberg bg-bloomberg-secondary p-1">
              <div className="border-b border-[var(--border-color)] px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-orange)] animate-glow-pulse" />
                  <span className="text-[10px] uppercase tracking-wider text-bloomberg-label">
                    CONNECTED
                  </span>
                </div>
                <p className="mt-1 truncate font-mono text-xs text-[var(--text-primary)]">
                  {address}
                </p>
              </div>
              <button
                onClick={() => {
                  disconnect();
                  setShowDropdown(false);
                }}
                className="mt-1 flex w-full items-center gap-2 px-3 py-2 text-left text-xs uppercase tracking-wider text-loss transition hover:bg-[#1a0505]"
              >
                <svg
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                Disconnect
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  if (status === "connecting") {
    return (
      <button
        disabled
        className="flex items-center gap-2 border border-bloomberg bg-bloomberg-tertiary px-3 py-1.5 text-xs font-medium text-accent"
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent-orange)]" />
        <span className="uppercase tracking-wider">Connecting...</span>
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="group relative overflow-hidden border border-[var(--accent-orange)] bg-bloomberg-tertiary px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-accent transition-all hover:bg-[var(--accent-orange)] hover:text-bloomberg-primary"
        aria-label="Connect wallet"
        aria-expanded={showDropdown}
        aria-haspopup="true"
      >
        <span className="relative z-10">Connect</span>
      </button>

      {showDropdown && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowDropdown(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 top-full z-50 mt-1 w-56 border-bloomberg bg-bloomberg-secondary p-1">
            <div className="border-b border-[var(--border-color)] px-3 py-2">
              <span className="text-[10px] uppercase tracking-wider text-bloomberg-label">
                SELECT WALLET
              </span>
            </div>
            {connectors.map((connector) => (
              <button
                key={connector.id}
                onClick={() => {
                  connect(connector.id);
                  setShowDropdown(false);
                }}
                className="mt-1 flex w-full items-center justify-between px-3 py-2 text-left text-xs transition hover:bg-bloomberg-tertiary"
              >
                <span className="uppercase tracking-wider">{connector.name}</span>
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--border-color)]" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function NavLink({
  href,
  label,
  shortcut,
  isActive,
  onClick,
}: {
  href: string;
  label: string;
  shortcut: string;
  isActive: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`group relative flex items-center gap-1 px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-all ${
        isActive
          ? "border border-[var(--accent-orange)] bg-bloomberg-tertiary text-accent"
          : "border border-transparent text-[var(--text-secondary)] hover:border-[var(--border-color)] hover:text-[var(--text-primary)]"
      }`}
    >
      <span className="text-accent transition-opacity group-hover:opacity-100">
        [
      </span>
      <span>{label}</span>
      <span className="text-accent transition-opacity group-hover:opacity-100">
        ]
      </span>
      {isActive && (
        <span className="ml-1 hidden text-[10px] text-accent lg:inline">
          /{shortcut}
        </span>
      )}
    </Link>
  );
}

export function Nav() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="fixed left-0 right-0 top-0 z-50">
      <DemoModeBanner />
      <div className="relative border-b border-[var(--border-color)] bg-bloomberg-secondary">
        <nav className="relative mx-auto flex h-12 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-1.5 transition hover:opacity-80"
              aria-label="Beneat home"
            >
              <Logo />
              <div className="flex flex-col">
                <span className="text-sm font-bold uppercase tracking-widest text-white">
                  BENEAT
                </span>
                <span className="hidden text-[8px] uppercase tracking-widest text-[var(--text-secondary)] sm:block">
                  RISK PROTOCOL v1.0
                </span>
              </div>
            </Link>

            <div className="hidden h-6 w-px bg-[var(--border-color)] md:block" />

            <div className="hidden items-center gap-1 md:flex">
              {NAV_LINKS.map((link) => (
                <NavLink
                  key={link.href}
                  href={link.href}
                  label={link.label}
                  shortcut={link.shortcut}
                  isActive={pathname === link.href}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <NetworkStatus />
            <SystemClock />

            <div className="hidden h-6 w-px bg-[var(--border-color)] sm:block" />

            <div className="hidden sm:block">
              <WalletButton />
            </div>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="border border-bloomberg p-1.5 text-[var(--text-secondary)] transition hover:border-[var(--accent-orange)] hover:text-accent md:hidden"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </nav>
      </div>

      {mobileMenuOpen && (
        <div className="border-b border-[var(--border-color)] bg-bloomberg-secondary md:hidden">
          <div className="mx-auto max-w-7xl space-y-1 px-4 py-3">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.href}
                href={link.href}
                label={link.label}
                shortcut={link.shortcut}
                isActive={pathname === link.href}
                onClick={() => setMobileMenuOpen(false)}
              />
            ))}

            <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-3">
              <div className="flex items-center gap-3">
                <StatusIndicator status="online" label="NETWORK" />
              </div>
              <WalletButton />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
