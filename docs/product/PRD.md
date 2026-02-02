---
purpose: Complete Product Requirements Document for Beneat - privacy-first perpetual trading with on-chain risk enforcement
related:
  - technical/architecture/overview
  - technical/integrations/index
  - development/implementation-status
source_of_truth: true
last_verified: 2026-02-01
---

# Beneat: Product Requirements Document

**Version:** 2.1
**Status:** Hackathon Phase (Implementation Complete)
**Date:** January 27, 2026
**Codename:** Dark Ghost

---

## 1. Executive Summary

**Beneat** is a privacy-first perpetual trading adapter built on Solana. We act as a "Parasitic Dark Pool" layer on top of Drift Protocol, wrapping public liquidity in an invisible tunnel that allows traders to:

1. **Hide trading intent** — Orders are encrypted in hardware enclaves until execution
2. **Hide P&L** — Profits and losses are compressed via zero-knowledge proofs
3. **Enforce discipline** — On-chain risk rules prevent self-destructive trading

Unlike competitors focused solely on privacy (Encifher, Aster Shield), Beneat uniquely combines **privacy + accountability** — your trades are hidden from bots, but your discipline is verifiable on-chain.

---

## 2. Problem Statement

### The Trader's Trilemma

Solana traders currently face three interconnected problems:

```
┌─────────────────────────────────────────────────────────────┐
│                    THE TRADER'S TRILEMMA                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│           PRIVACY ◄───────────────────► LIQUIDITY          │
│               ▲                             ▲               │
│               │                             │               │
│               │      Can only pick 2        │               │
│               │                             │               │
│               └──────────► DISCIPLINE ◄─────┘               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Current Solutions:                                         │
│                                                             │
│  • Drift/Jupiter: Liquidity ✓, Privacy ✗, Discipline ✗     │
│  • Encifher: Privacy ✓, Liquidity ✓, Discipline ✗          │
│  • Self-custody: Discipline ✗ (no enforcement)              │
│  • CEX: Discipline ✓ (limits), Privacy ✗, Custody ✗        │
│                                                             │
│  NO SOLUTION offers all three.                              │
└─────────────────────────────────────────────────────────────┘
```

### Specific Threats

| Threat | Impact | Who's Affected |
|--------|--------|----------------|
| **Front-running** | Bots see your order, trade ahead | All traders |
| **Stop hunting** | Bots target visible stop-losses | Leveraged traders |
| **Sandwich attacks** | MEV extraction during swaps | Large orders |
| **On-chain analysis** | Competitors track your P&L | Whales, funds |
| **Revenge trading** | Emotional trades after losses | 80% of traders |
| **Overtrading** | Excessive position frequency | Gamblers |

---

## 3. Solution: The Beneat Stack

Beneat solves the trilemma with a five-layer architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                     BENEAT ARCHITECTURE                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Layer 5: BEHAVIORAL ANALYSIS                               │
│           └── Pattern detection, risk scoring               │
│                                                             │
│  Layer 4: VAULT (Anchor Program)                            │
│           └── On-chain rule enforcement, lockouts           │
│                                                             │
│  Layer 3: LIGHT PROTOCOL (ZK Compression)                   │
│           └── Balance/P&L privacy via zero-knowledge        │
│                                                             │
│  Layer 2: JITO (Bundle Engine)                              │
│           └── MEV protection, atomic execution              │
│                                                             │
│  Layer 1: MAGICBLOCK (TEE Ephemeral Rollups)                │
│           └── Order privacy, conditional triggers           │
│                                                             │
│  Layer 0: DRIFT PROTOCOL                                    │
│           └── Liquidity, perpetual futures engine           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Technical Architecture: Layer-by-Layer

### Layer 0: Drift Protocol (Liquidity)

#### What It Does
Drift is the underlying perpetual futures exchange providing liquidity, margin, and settlement.

#### Implementation
```typescript
// From use-drift.ts
import { DriftClient, PerpMarkets } from '@drift-labs/sdk';

// Initialize user with sub-account
const userPDA = deriveUserPDA(walletAddress, subAccountId);
await buildInitializeUserInstruction(userPDA, ...);

// Open perpetual position
await buildOpenPerpPositionInstruction({
  marketIndex: 0, // SOL-PERP
  direction: 'long',
  baseAssetAmount: size,
  price: entryPrice,
});
```

#### Capabilities
| Feature | Status | Notes |
|---------|--------|-------|
| User initialization | ✓ | Sub-accounts supported |
| USDC deposits | ✓ | Spot market index 0 |
| Perp positions | ✓ | SOL, BTC, ETH (indices 0, 1, 2) |
| Position closing | ✓ | Partial and full |
| Liquidation tracking | ✓ | Via SDK |

#### Constraints
| Constraint | Value | Impact |
|------------|-------|--------|
| Max leverage | 20x (101x for majors) | Position sizing limits |
| Markets | ~40 perpetuals | Limited to Drift offerings |
| Settlement | USDC only | No multi-collateral |
| Compute Units | ~150-200k per trade | Fits standard TX |

#### Drawbacks
| Drawback | Severity | Mitigation |
|----------|----------|------------|
| Platform dependency | High | If Drift fails, Beneat fails |
| Public order book | Medium | We add privacy layer on top |
| Funding rates | Low | Pass-through to users |
| Liquidation risk | Medium | Vault rules can limit leverage |

---

### Layer 1: MagicBlock (Intent Privacy)

#### What It Does
MagicBlock Ephemeral Rollups provide hardware-enforced privacy for pending orders via Intel TDX Trusted Execution Environments.

#### How TEE Works
```
┌─────────────────────────────────────────────────────────────┐
│                 TRUSTED EXECUTION ENVIRONMENT               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  OUTSIDE TEE (Visible):          INSIDE TEE (Private):     │
│  • Encrypted blob                • Decrypted order         │
│  • Session public key            • Trigger conditions      │
│  • Delegation proof              • Execution logic         │
│                                                             │
│  Even MagicBlock operators cannot see inside the enclave.  │
│  Hardware (Intel TDX) enforces isolation.                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Implementation
```typescript
// From use-magicblock.ts
import {
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram,
  DELEGATION_PROGRAM_ID
} from '@magicblock-labs/ephemeral-rollups-sdk';

// Create session keypair (stored in TEE)
const sessionKeypair = Keypair.generate();

// Delegate account to Ephemeral Rollup
const delegationPda = delegateBufferPdaFromDelegatedAccountAndOwnerProgram(
  accountToDelegate,
  ownerProgram
);

// Execute in TEE (orders hidden)
await executeInER(encryptedOrderPayload);
```

#### Ghost Order Flow
```typescript
// From use-ghost-orders.ts
interface GhostOrder {
  id: string;
  type: 'limit_buy' | 'limit_sell' | 'stop_loss' | 'take_profit' | 'oco';
  triggerPrice: number;
  size: number;
  sessionKey: string;      // TEE session
  delegateApprovalSig: string;  // Light Protocol delegation
  status: 'active' | 'triggered' | 'cancelled' | 'expired';
}

// Encrypt order for TEE submission
const encryptedPayload = await encryptOrderParams(params, sessionPublicKey);
const orderHash = await computeOrderHash(params);
await executeInER(createTEESubmissionPayload(encryptedPayload, orderHash, ...));
```

#### Capabilities
| Feature | Status | Notes |
|---------|--------|-------|
| Session keypairs | ✓ Implemented | Ed25519, persisted encrypted in localStorage |
| Account delegation | ✓ Implemented | PDA-based via @ephemeral macro, verifiable on-chain |
| ER connection | ✓ Implemented | devnet.magicblock.app WebSocket |
| Order encryption | ✓ Implemented | AES-GCM with PBKDF2 key derivation |
| TEE submission | ✓ Implemented | Encrypted payloads sent to ER |
| Price monitoring | ✓ Implemented | WebSocket subscription to Pyth Lazer feeds |
| Undelegation | ✓ Implemented | @commit macro with 3s state propagation delay |
| Session expiry | ✓ Implemented | 60-minute configurable lifetime |
| Fund escrow | ✓ Implemented | Session funding for ER operations |

#### Constraints
| Constraint | Value | Impact |
|------------|-------|--------|
| TEE hardware | Intel TDX only | Limits node operators |
| Session lifetime | Configurable | Must refresh periodically |
| Delegation scope | Per-account | Cannot delegate entire wallet |
| Attestation latency | ~1-2s initial | Session setup overhead |
| ER finality | ~50ms | Fast, but not instant |

#### Drawbacks
| Drawback | Severity | Mitigation |
|----------|----------|------------|
| Trust Intel hardware | Medium | TDX newer than SGX, fewer vulns |
| Liveness dependency | Medium | Fallback to manual execution |
| Not trustless | Medium | Hardware trust vs math trust |
| Complexity | Medium | Abstract behind simple API |
| Single TEE provider | High | MagicBlock is only option on Solana |

#### Security Considerations
```
┌─────────────────────────────────────────────────────────────┐
│  TEE TRUST MODEL                                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  You ARE trusting:                                          │
│  • Intel TDX has no vulnerabilities                         │
│  • MagicBlock operators maintain liveness                   │
│  • Attestation is cryptographically valid                   │
│                                                             │
│  You are NOT trusting:                                      │
│  • MagicBlock to not see your orders (they can't)           │
│  • Anyone to not steal funds (delegation is scoped)         │
│  • Network observers (encrypted in transit)                 │
│                                                             │
│  Historical note: Intel SGX had multiple exploits           │
│  (sgx.fail). TDX is newer but not proven long-term.        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**⚠️ Activity Detection Warning:**

While order *contents* are hidden inside the TEE, **trading activity itself is detectable**:

| Observable On-Chain | Hidden in TEE |
|---------------------|---------------|
| Delegation transactions (wallet → vault → DELEGATION_PROGRAM) | Pending order intents |
| Vault ownership changes | Trigger prices and conditions |
| Executed trades on Drift (post-confirmation) | Order contents until execution |
| Session keypair public key (in ER) | Session keypair activity on L1 |

**Implication:** Sophisticated observers can detect *when* you're about to trade (delegation event) even though they cannot see *what* you're trading. This provides **mempool privacy** (no front-running), not **activity privacy** (hiding that you're trading at all).

---

### Layer 2: Jito (MEV Protection)

#### What It Does
Jito bundles multiple instructions atomically, bypassing the public mempool to prevent sandwich attacks and front-running during execution.

#### How Bundles Work
```
┌─────────────────────────────────────────────────────────────┐
│  WITHOUT JITO                    WITH JITO                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Your TX → Mempool → Bots see    Your TX → Jito Engine     │
│              ↓                              ↓               │
│         Bot front-runs           Bundle (atomic, private)   │
│              ↓                              ↓               │
│         Your TX executes         All-or-nothing execution   │
│              ↓                              ↓               │
│         Bot back-runs            No MEV extraction          │
│              ↓                                              │
│         You lose to sandwich                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Implementation
```typescript
// From jito-bundle.ts
export const JITO_TIP_ACCOUNTS = [
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
  // ... 8 total tip accounts
];

export async function submitAtomicBundle(params: SubmitBundleParams): Promise<BundleResult> {
  // 1. Set compute budget
  const setCULimitIx = ComputeBudgetProgram.setComputeUnitLimit({
    units: SHIELDED_TRADE_COMPUTE_UNITS, // 1,400,000 for ZK trades
  });

  // 2. Set priority fee
  const setPriorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: priorityFeeMultipliers[priorityLevel],
  });

  // 3. Add tip to random Jito account
  const tipInstruction = await createTipInstruction(payer, effectiveTip);

  // 4. Bundle all instructions
  const allInstructions = [setCULimitIx, setPriorityFeeIx, ...instructions, tipInstruction];

  // 5. Simulate before sending
  const simResult = await connection.simulateTransaction(transaction);
  if (simResult.value.err) throw new Error('Simulation failed');

  // 6. Submit to Jito block engine
  const { bundleId } = await submitBundleToJito([serializedTx]);

  // 7. Poll for confirmation
  while (attempts < maxAttempts) {
    const status = await getBundleStatus(bundleId);
    if (status.landed) return { success: true, bundleId };
  }
}
```

#### Retry with Tip Escalation
```typescript
// From jito-bundle.ts
export async function submitAtomicBundleWithRetry(
  params: SubmitBundleParams,
  retryConfig?: RetryConfig
): Promise<BundleResult> {
  const { maxRetries = 3, tipEscalation = 1.5, maxTipLamports = 500_000 } = retryConfig;

  let currentTip = params.tipAmount ?? await estimateBundleTip(connection, priorityLevel);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await submitAtomicBundle({ ...params, tipAmount: currentTip });
    if (result.success) return result;

    // Escalate tip for next attempt
    currentTip = Math.min(currentTip * tipEscalation, maxTipLamports);
  }
}
```

#### Capabilities
| Feature | Status | Notes |
|---------|--------|-------|
| Tip account selection | ✓ Real | 8 accounts, random selection |
| Compute budget | ✓ Real | Up to 1.4M CU |
| Priority fees | ✓ Real | Low/medium/high presets |
| Bundle submission | ✓ Real | Jito block engine API |
| Status polling | ✓ Real | Confirmation tracking |
| Retry logic | ✓ Real | Tip escalation on failure |
| Multi-TX bundles | ✓ Real | Up to 5 transactions |
| Simulation | ✓ Real | Pre-flight checks |

#### Constraints
| Constraint | Value | Impact |
|------------|-------|--------|
| Bundle size | Max 5 transactions | Multi-step operations limited |
| Tip minimum | 10,000 lamports | Base cost ~$0.001 |
| CU maximum | 1,400,000 | ZK operations fit, barely |
| Confirmation time | ~2-60 seconds | Not instant |
| Mainnet only | Jito on mainnet | Devnet uses simulation |

#### Drawbacks
| Drawback | Severity | Mitigation |
|----------|----------|------------|
| Cost during congestion | Medium | Tip escalation, user-configurable max |
| Not guaranteed inclusion | Low | Retry logic with escalation |
| Centralized block engine | Medium | Jito is dominant but not only option |
| Tip variance | Low | Dynamic estimation from recent fees |

---

### Layer 3: Light Protocol (Balance Privacy)

#### What It Does
Light Protocol provides ZK compression for token balances, hiding P&L from on-chain observers while maintaining verifiable ownership.

#### How ZK Compression Works
```
┌─────────────────────────────────────────────────────────────┐
│  LIGHT PROTOCOL: COMPRESSED vs REGULAR TOKENS               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  REGULAR TOKEN ACCOUNT:          COMPRESSED TOKEN:          │
│  ┌─────────────────────┐         ┌─────────────────────┐   │
│  │ Owner: 0x123...     │         │ Merkle Root: 0xabc  │   │
│  │ Mint: USDC          │         │ (stores nothing     │   │
│  │ Balance: 10,000     │ ◄─────► │  about balance)     │   │
│  │ ^^^ PUBLIC ^^^      │         │                     │   │
│  └─────────────────────┘         └─────────────────────┘   │
│                                           │                 │
│                                           ▼                 │
│                                  Off-chain (Merkle tree):   │
│                                  • Balance: 10,000          │
│                                  • Owner proof              │
│                                  • ZK validity              │
│                                                             │
│  To spend: Generate ZK proof that you own the leaf         │
│  without revealing the balance amount.                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Implementation
```typescript
// From use-light-protocol.ts
import {
  Rpc,
  createRpc,
  getCompressedTokenAccountsByOwner
} from '@lightprotocol/stateless.js';
import { CompressedTokenProgram } from '@lightprotocol/compressed-token';

// Query compressed balances (real SDK call)
const compressedAccounts = await connection.getCompressedTokenAccountsByOwner(
  ownerPublicKey,
  { mint: USDC_MINT }
);

// Build decompress instruction
const decompressIx = await CompressedTokenProgram.decompress({
  payer: walletAddress,
  inputCompressedTokenAccounts: compressedAccounts,
  toAddress: destinationATA,
  amount: decompressAmount,
  // ZK proof generated by SDK
});

// Build compress instruction
const compressIx = await CompressedTokenProgram.compress({
  payer: walletAddress,
  owner: walletAddress,
  source: sourceATA,
  toAddress: compressedAccountAddress,
  amount: compressAmount,
  mint: USDC_MINT,
});
```

#### Shield Mode Flow (Atomic)
```typescript
// From use-shield.ts
async function executeShieldedTrade(params: ShieldTradeParams): Promise<ShieldResult> {
  const instructions: TransactionInstruction[] = [];

  // 1. Decompress collateral from Light Protocol
  const decompressResult = await lightProtocol.buildDecompressInstructionForBundle(
    collateralAmountBigInt,
    USDC_MINT
  );
  instructions.push(decompressResult.instruction);

  // 2. Deposit to Drift
  const depositIx = await drift.getDepositInstruction(collateralAmountBigInt, USDC_MINT);
  instructions.push(depositIx);

  // 3. Open position on Drift
  const openIx = await drift.getOpenPositionInstruction(params);
  instructions.push(openIx);

  // 4. Recompress any remaining balance
  const compressResult = await lightProtocol.buildCompressInstructionForBundle(
    collateralAmountBigInt,
    USDC_MINT
  );
  instructions.push(compressResult.instruction);

  // 5. Submit as atomic Jito bundle
  return await submitAtomicBundleWithRetry({ instructions, ... });
}
```

#### Capabilities
| Feature | Status | Notes |
|---------|--------|-------|
| Compressed balance queries | ✓ Implemented | `getCompressedTokenAccountsByOwner()` via SDK |
| Token pool validation | ✓ Implemented | SDK handles pool lookups |
| Indexer health checks | ✓ Implemented | Status monitoring with connection tracking |
| Decompress instruction | ✓ Built | Instruction building complete; signing in dev mode simulated |
| Compress instruction | ✓ Built | Instruction building complete; signing in dev mode simulated |
| Delegation approval | ✓ Built | For TEE access; instruction building complete |
| Compress with delegate | ✓ Built | Creates delegatable compressed accounts |
| Merkle state sync | ✓ Implemented | Waits for ZK proof generation |
| Dev mode mock | ✓ Implemented | Returns consistent mock balances for testing |

#### Constraints
| Constraint | Value | Impact |
|------------|-------|--------|
| Proof generation | 3-10 seconds | Client-side latency |
| Compute Units | ~292k per compress/decompress | Eats into TX budget |
| State tree write lock | 12M CU per tree per block | Concurrent user limit |
| Indexer dependency | Required for queries | Liveness risk |
| Supported tokens | USDC, SOL, major SPL | Not all tokens |

**State Tree Scaling Note:** Light Protocol uses Merkle state trees with a per-block write lock limit of 12,000,000 CU per tree. At ~292k CU per operation, approximately 41 concurrent users could theoretically saturate a single tree. Light Protocol mitigates this via multiple state trees, but this remains a scaling consideration at high volumes.

#### Compute Unit Breakdown
```
┌─────────────────────────────────────────────────────────────┐
│  SHIELD MODE CU BUDGET                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Operation                    CU Cost      Running Total    │
│  ─────────────────────────────────────────────────────────  │
│  Decompress (Light)           ~292,000         292,000      │
│  Deposit (Drift)              ~150,000         442,000      │
│  Open Position (Drift)        ~300,000         742,000      │
│  Compress (Light)             ~292,000       1,034,000      │
│  Overhead + buffer            ~100,000       1,134,000      │
│  ─────────────────────────────────────────────────────────  │
│  TOTAL                                      ~1,134,000 CU   │
│                                                             │
│  Solana TX limit: 1,400,000 CU                              │
│  Margin: ~100-266k CU (congestion-dependent)                │
│                                                             │
│  NOTE: Light Protocol CU costs from official docs:          │
│  • ~100k for validity proof verification                    │
│  • ~100k for state tree hashing                             │
│  • ~6k per compressed account operation                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Drawbacks
| Drawback | Severity | Mitigation |
|----------|----------|------------|
| Proof generation latency | High | UX shows progress, ~5-10s wait |
| High CU cost | Medium | Explicit budget request in TX (~292k per compress/decompress) |
| Transaction cost | Medium | ~$0.50-1.00 during congestion |
| Indexer centralization | Medium | Light runs primary indexer |
| Client-side proving | Medium | Requires capable device |
| Dev mode simulation | Medium | Instructions built correctly; production needs wallet adapter signing |

---

### Layer 4: Vault (Risk Enforcement)

#### What It Does
The Vault is an on-chain Anchor program that enforces trading rules. It's the "discipline layer" that makes Beneat unique.

#### Account Structure
```rust
// From programs/vault/src/state/vault.rs
#[account]
pub struct Vault {
    pub owner: Pubkey,
    pub is_locked: bool,
    pub lockout_until: i64,
    pub daily_loss_limit: u64,
    pub max_trades_per_day: u8,
    pub trades_today: u8,
    pub cooldown_seconds: u32,
    pub session_start: i64,
    pub last_trade_time: i64,
    pub last_trade_was_loss: bool,
    pub cumulative_loss_today: u64,
}
```

#### Instructions
```rust
// From programs/vault/src/lib.rs
#[program]
pub mod vault {
    pub fn initialize(ctx: Context<Initialize>) -> Result<()>;
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()>;
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()>;
    pub fn set_rules(ctx: Context<SetRules>, rules: VaultRules) -> Result<()>;
    pub fn manual_lock(ctx: Context<ManualLock>, duration: i64) -> Result<()>;
    pub fn unlock(ctx: Context<Unlock>) -> Result<()>;
    pub fn pre_swap_check(ctx: Context<PreSwapCheck>) -> Result<()>;
    pub fn post_swap_update(ctx: Context<PostSwapUpdate>, was_loss: bool) -> Result<()>;
}
```

#### Enforcement Logic
```rust
// Pre-trade validation
pub fn pre_swap_check(ctx: Context<PreSwapCheck>) -> Result<()> {
    let vault = &ctx.accounts.vault;
    let current_time = Clock::get()?.unix_timestamp;

    // Check lockout
    require!(!vault.is_currently_locked(current_time), VaultError::VaultLocked);

    // Check cooldown (post-loss waiting period)
    require!(!vault.is_in_cooldown(current_time), VaultError::CooldownActive);

    // Check daily trade limit
    require!(
        vault.trades_today < vault.max_trades_per_day,
        VaultError::TradeLimitExceeded
    );

    // Check daily loss limit
    require!(
        vault.cumulative_loss_today < vault.daily_loss_limit,
        VaultError::DailyLossLimitReached
    );

    Ok(())
}

// Post-trade update
pub fn post_swap_update(ctx: Context<PostSwapUpdate>, was_loss: bool) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let current_time = Clock::get()?.unix_timestamp;

    vault.trades_today += 1;
    vault.last_trade_time = current_time;
    vault.last_trade_was_loss = was_loss;

    if was_loss {
        // Track loss
        vault.cumulative_loss_today += loss_amount;

        // Auto-lock if limit breached
        if vault.cumulative_loss_today >= vault.daily_loss_limit {
            vault.is_locked = true;
            vault.lockout_until = current_time + LOCKOUT_DURATION;
        }
    }

    Ok(())
}
```

#### Frontend Integration
```typescript
// From use-vault.ts
export function useVault(): UseVaultReturn {
  const canTrade = useCallback((): { allowed: boolean; reason?: string } => {
    if (!vault) return { allowed: false, reason: 'Vault not initialized' };
    if (vault.isLocked) return { allowed: false, reason: 'Vault is locked' };
    if (vault.tradesRemaining <= 0) return { allowed: false, reason: 'Daily trade limit reached' };
    if (vault.isInCooldown) return { allowed: false, reason: 'Cooldown active' };
    return { allowed: true };
  }, [vault]);

  const recordTrade = useCallback(async (wasLoss: boolean, lossAmount?: number) => {
    // Update on-chain vault state
    await program.methods
      .postSwapUpdate(wasLoss)
      .accounts({ vault: vaultPda, owner: wallet })
      .rpc();
  }, [program, vaultPda, wallet]);
}
```

#### Capabilities
| Feature | Status | Notes |
|---------|--------|-------|
| Vault initialization | ✓ Implemented | PDA per user, configurable lockout duration |
| Deposit | ✓ Implemented | SOL CPI transfer, tracks total_deposited |
| Withdraw | ✓ Implemented | Respects lockout, rent-exempt minimum, tracks total_withdrawn |
| Rule configuration | ✓ Implemented | Sets daily_loss_limit, max_trades_per_day, lockout_duration |
| Pre-swap check | ✓ Implemented | Validates lockout, cooldown, daily limits; captures balance_before |
| Post-swap update | ✓ Implemented | Compares balance to determine win/loss, increments trade count |
| Manual lock | ✓ Implemented | Sets lockout_until, increments lockout_count |
| Auto-unlock | ✓ Implemented | Time-based expiry check |
| MagicBlock delegation | ✓ Implemented | @ephemeral/@commit macros for ER integration |

#### Constraints
| Constraint | Value | Impact |
|------------|-------|--------|
| Single owner | 1 per vault | No shared vaults |
| Daily reset | UTC midnight | Session boundary |
| Lock duration | Configurable | Min 1 hour recommended |
| Max trades | u8 (255) | Sufficient for most |

#### Drawbacks
| Drawback | Severity | Mitigation |
|----------|----------|------------|
| Self-imposed only | Low | That's the point |
| Bypassable (new wallet) | Medium | Reputation system future |
| On-chain storage cost | Low | Minimal rent |
| Clock dependency | Low | Solana clock is reliable |

---

### Layer 5: Behavioral Analysis

#### What It Does
Client-side pattern detection that identifies self-destructive trading behavior and suggests/enforces cooldowns.

#### Detected Patterns
```typescript
// From use-behavioral-analysis.ts
export interface BehavioralPatterns {
  revengeTrading: boolean;      // Trading immediately after loss
  overtrading: boolean;         // Exceeding daily limit
  losingStreak: boolean;        // 3+ consecutive losses
  badHoursTrading: boolean;     // Trading 23:00-05:00
  tiltSizing: boolean;          // Position size increasing after losses
}

export interface BehavioralAnalysis {
  patterns: BehavioralPatterns;
  riskScore: number;            // 0-100
  suggestedCooldown: number;    // 0-300 seconds
  shouldBlock: boolean;         // Hard block recommendation
}
```

#### Detection Logic
```typescript
function analyzeTrading(history: TradeHistory[]): BehavioralAnalysis {
  const patterns: BehavioralPatterns = {
    revengeTrading: detectRevengeTrades(history),
    overtrading: history.filter(t => isToday(t.timestamp)).length > DAILY_LIMIT,
    losingStreak: countConsecutiveLosses(history) >= 3,
    badHoursTrading: isBadHours(new Date()),
    tiltSizing: detectTiltSizing(history),
  };

  // Calculate risk score (0-100)
  let riskScore = 0;
  if (patterns.revengeTrading) riskScore += 30;
  if (patterns.overtrading) riskScore += 25;
  if (patterns.losingStreak) riskScore += 20;
  if (patterns.badHoursTrading) riskScore += 15;
  if (patterns.tiltSizing) riskScore += 25;

  // Suggest cooldown based on risk
  const suggestedCooldown = riskScore > 70 ? 300 : riskScore > 50 ? 120 : riskScore > 30 ? 60 : 0;

  return {
    patterns,
    riskScore: Math.min(100, riskScore),
    suggestedCooldown,
    shouldBlock: riskScore > 80,
  };
}
```

#### Integration with Vault
```typescript
// Before allowing trade
const analysis = analyzeTrading(tradeHistory);
if (analysis.shouldBlock) {
  // Trigger vault lock
  await vault.manualLock(analysis.suggestedCooldown);
  throw new Error(`Trading blocked: Risk score ${analysis.riskScore}`);
}
```

#### Capabilities
| Feature | Status | Notes |
|---------|--------|-------|
| Revenge trade detection | ✓ Implemented | Uses vault.lastTradeWasLoss + timeSinceLastTrade |
| Overtrading detection | ✓ Implemented | Uses vault.tradesToday vs maxTradesPerDay |
| Losing streak tracking | ✓ Implemented | Pattern based on vault.lastTradeWasLoss |
| Bad hours warning | ✓ Implemented | 23:00-05:00 local time check |
| Risk scoring | ✓ Implemented | 0-100 weighted composite (40% revenge, 25% overtrading, 20% bad hours, 15% streaks) |
| Emotion/discipline/patience scores | ✓ Implemented | Derived from vault state + override history |
| Cooldown suggestions | ✓ Implemented | Risk-proportional (0/60/180/300s by level) |
| Behavioral store | ✓ Implemented | Zustand store for override tracking |

#### Drawbacks
| Drawback | Severity | Mitigation |
|----------|----------|------------|
| Client-side computation | Low | Uses on-chain vault state as source of truth |
| Heuristic-based | Low | Tunable thresholds via pattern weights |
| Override tracking local | Medium | Zustand store persists; vault lockouts are on-chain |
| No ML/advanced | Low | Rule-based detection sufficient for MVP |

---

## 5. Trading Modes

### Mode Comparison

| | Flash Mode | Shield Mode |
|---|------------|-------------|
| **Intent Privacy** | ✗ | ✓ TEE (mempool only) |
| **Execution Privacy** | ✓ Jito | ✓ Jito |
| **Balance Privacy** | ✗ | ✓ Light ZK |
| **Order Types** | Market only | Market + Conditional |
| **Latency** | ~400ms | ~10-30s typical |
| **Cost** | ~$0.01 | ~$0.50-1.00 |
| **CU Usage** | ~300k | ~1.1M |
| **Target User** | Scalpers | Whales |

### Flash Mode Architecture
```
┌─────────────────────────────────────────────────────────────┐
│  FLASH MODE: "Fast public trade with MEV protection"        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  User Wallet ──► Vault Check ──► Drift ──► Jito ──► Settle  │
│                                                              │
│  • No TEE (no hidden orders)                                 │
│  • No Light Protocol (public balance)                        │
│  • Jito prevents sandwich during execution                   │
│  • Market orders only                                        │
│  • Fast, cheap                                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Shield Mode Architecture
```
┌─────────────────────────────────────────────────────────────┐
│  SHIELD MODE: "Total darkness with conditional orders"      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. User delegates to MagicBlock TEE                        │
│  2. Ghost orders encrypted in enclave                       │
│  3. TEE monitors price feeds                                │
│  4. On trigger:                                              │
│     a. Decompress from Light Protocol                       │
│     b. Deposit to Drift                                     │
│     c. Execute trade                                        │
│     d. Withdraw from Drift                                  │
│     e. Recompress to Light Protocol                         │
│  5. All steps bundled via Jito (atomic)                     │
│                                                              │
│  • Full intent privacy (TEE)                                 │
│  • Full balance privacy (ZK)                                 │
│  • Full execution privacy (Jito)                             │
│  • Supports limits, stops, take profits, OCO                 │
│  • Slower, more expensive                                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Security Model

### Trust Assumptions

| Component | Trust Model | What Could Go Wrong |
|-----------|-------------|---------------------|
| Drift | Smart contract | Bug, exploit, rug |
| MagicBlock | Intel TDX + operators | Hardware vuln, downtime |
| Light Protocol | ZK math + indexer | Indexer downtime |
| Jito | Block engine | Censorship, downtime |
| Vault | Your own program | Your bugs |

### Attack Vectors & Mitigations

| Attack | Vector | Mitigation |
|--------|--------|------------|
| Front-running | Mempool observation | TEE hides intent, Jito bundles |
| Sandwich | MEV during execution | Jito atomic bundles |
| Stop hunting | Visible stop-losses | TEE encrypts triggers |
| Balance analysis | On-chain tracking | Light Protocol compression |
| Revenge trading | User psychology | Behavioral analysis + vault |

### What's NOT Protected

| Risk | Explanation |
|------|-------------|
| Smart contract bugs | Drift or vault could have exploits |
| TEE hardware vulnerabilities | If Intel TDX is broken, orders exposed |
| Liquidation | Leverage risk remains |
| Oracle manipulation | Pyth/Drift oracle attacks possible |
| Regulatory | Privacy may attract scrutiny |

---

## 7. Technical Constraints Summary

### Compute Unit Budget

| Mode | CU Required | Margin |
|------|-------------|--------|
| Flash | ~300,000 | 1,100,000 spare |
| Shield | ~1,134,000 | 100-266k (congestion-dependent) |
| Maximum | 1,400,000 | Hard limit |

**Note:** Shield Mode margin is tighter than Flash Mode. Complex positions with oracle updates or network congestion may consume additional CU. The implementation includes pre-flight simulation to catch CU overruns before submission.

### Latency Budget

| Operation | Time |
|-----------|------|
| TEE session setup | 1-2s (one-time) |
| Order encryption | <100ms |
| ZK proof generation | 3-10s |
| Merkle state sync | 1-3s |
| Jito bundle submission | <1s |
| Confirmation polling | 2-60s |
| **Shield Mode Total** | **10-30s typical, up to 60s congested** |
| **Flash Mode Total** | **<2s** |

**Latency Breakdown:**
- Best case: 3s (proof) + 2s (Jito confirm) = **5s**
- Typical: 5s (proof) + 3s (sync) + 10s (Jito) = **18s**
- Worst case: 10s (proof) + 3s (sync) + 60s (Jito) = **73s**

### Cost Estimates

| Mode | Normal | Congested |
|------|--------|-----------|
| Flash | ~$0.01 | ~$0.05 |
| Shield | ~$0.20 | ~$1.00+ |

---

## 8. Competitive Positioning

| | Beneat | Encifher | Aster Shield |
|---|--------|----------|--------------|
| **Product** | Private perps + discipline | Private swaps | Private perps |
| **Chain** | Solana | Solana | Multi-chain |
| **Liquidity** | Drift (wrapped) | Jupiter (wrapped) | Own DEX |
| **Privacy Tech** | TEE + ZK | Threshold encryption | ZK (own L1) |
| **Unique Value** | Risk enforcement | Unlinkable txs | High leverage |
| **Target User** | Disciplined traders | Privacy maximalists | Degens |

### Beneat's Moat

1. **Only privacy solution with risk enforcement**
2. **Only solution targeting trader psychology**
3. **Public accountability + private P&L (unique combo)**

---

## 9. Roadmap

### Hackathon Phase (Current)
**Fully Implemented:**
- [x] Drift integration - user init, deposit, withdraw, perp positions, liquidation tracking
- [x] MagicBlock session management - keypair generation, delegation, ER connection
- [x] Jito bundle framework - atomic submission, retry with tip escalation, status polling
- [x] Vault program (on-chain) - all 9 instructions: initialize, deposit, withdraw, set_rules, manual_lock, unlock, pre_swap_check, post_swap_update, delegate/undelegate
- [x] Behavioral analysis - real pattern detection using vault state (revenge trading, overtrading, bad hours, losing streak)
- [x] Ghost order encryption - AES-GCM order encryption with TEE submission
- [x] Price feeds - WebSocket connection to MagicBlock Pyth Lazer

**Infrastructure Ready (signing/execution simulated in dev mode):**
- [x] Light Protocol SDK integration - compress/decompress instruction building
- [x] TEE order submission framework - encrypted payloads ready for MagicBlock execution
- [x] Shield mode orchestration - full flow from decompress → trade → recompress

### Post-Hackathon
- [ ] Light Protocol wallet adapter integration
- [ ] MagicBlock TEE execution (production)
- [ ] Multi-market support (more Drift markets)
- [ ] Advanced order types (trailing stop, etc.)
- [ ] Mobile support

### Future
- [ ] Cross-margin vaults
- [ ] Social accountability features
- [ ] Reputation system
- [ ] Additional DEX integrations

---

## 10. Appendix: File Reference

### Deployed Programs (Devnet)

| Program | Program ID | Instructions |
|---------|------------|--------------|
| **vault** | `GaxNRQXHVoYJQQEmXGRWSmBRmAvt7iWBtUuYWf8f8pki` | 13 instructions |
| **ghost-crank** | `7VvD7j99AE7q9PC9atpJeMEUeEzZ5ZYH7WqSzGdmvsqv` | 9 instructions |
| **ghost-bridge** | `8w95bQ7UzKHKa4NYvyVeAVGN3dMgwshJhhTinPfabMLA` | 12 instructions |

### Backend (Anchor/Rust)

#### Vault Program (`app/anchor/programs/vault/`)
| File | Purpose |
|------|---------|
| `src/lib.rs` | Program entry with 13 instructions |
| `src/state/vault.rs` | Vault account structure (28 fields) |
| `src/state/trader_profile.rs` | Trader profile card (6 stats) |
| `src/instructions/initialize.rs` | Creates vault PDA |
| `src/instructions/deposit.rs` | SOL deposit to vault |
| `src/instructions/withdraw.rs` | SOL withdrawal with lockout check |
| `src/instructions/set_rules.rs` | Configure risk rules |
| `src/instructions/manual_lock.rs` | Self-imposed lockout |
| `src/instructions/unlock.rs` | Time-based unlock |
| `src/instructions/swap.rs` | Swap with pre/post enforcement |
| `src/instructions/delegate.rs` | MagicBlock ER delegation |
| `src/instructions/undelegate.rs` | Undelegate from ER |
| `src/instructions/initialize_profile.rs` | Create trader profile |
| `src/instructions/update_stats.rs` | Update trading stats |
| `src/errors.rs` | Custom error codes |

#### Ghost-Crank Program (`app/anchor/programs/ghost-crank/`)
| File | Purpose |
|------|---------|
| `src/lib.rs` | Program entry with 9 instructions |
| `src/state/ghost_order.rs` | Ghost order state |
| `src/instructions/create_ghost_order.rs` | Create encrypted order |
| `src/instructions/delegate_order.rs` | Delegate to ER |
| `src/instructions/check_trigger.rs` | Check price trigger |
| `src/instructions/execute_trigger.rs` | Execute triggered order |
| `src/instructions/execute_with_commitment.rs` | Atomic Shield execution |
| `src/instructions/cancel_order.rs` | Cancel ghost order |
| `src/instructions/mark_ready.rs` | Mark order ready |

#### Ghost-Bridge Program (`app/anchor/programs/ghost-bridge/`)
| File | Purpose |
|------|---------|
| `src/lib.rs` | Program entry with 12 instructions |
| `src/state/encrypted_order.rs` | TEE-encrypted order state |
| `src/state/executor_authority.rs` | Executor delegation |
| `src/instructions/init_executor.rs` | Initialize TEE executor |
| `src/instructions/delegate_executor.rs` | Delegate to TEE |
| `src/instructions/create_encrypted_order.rs` | Create TEE order |
| `src/instructions/trigger_and_execute.rs` | TEE trigger execution |
| `src/drift_cpi.rs` | Drift Protocol CPI helpers |
| `src/errors.rs` | Custom error codes |

### Frontend (Next.js/React)

| File | Purpose |
|------|---------|
| `app/hooks/use-drift.ts` | Drift Protocol integration |
| `app/hooks/use-vault.ts` | Vault program interaction |
| `app/hooks/use-magicblock.ts` | MagicBlock ER sessions |
| `app/hooks/use-magicblock-prices.ts` | Price WebSocket feeds |
| `app/hooks/use-light-protocol.ts` | Light Protocol ZK |
| `app/hooks/use-shield.ts` | Shield mode orchestration |
| `app/hooks/use-ghost-crank.ts` | Ghost order management |
| `app/hooks/use-private-ghost-orders.ts` | Private ghost orders |
| `app/hooks/use-trader-profile.ts` | Trader card data |
| `app/hooks/use-behavioral-analysis.ts` | Pattern detection |
| `app/lib/jito-bundle.ts` | Jito bundle submission |
| `app/lib/drift-instructions.ts` | Drift CPI helpers |

---

*Document updated: January 27, 2026*
*Beneat v2.1 - Hackathon Phase (Implementation Complete)*
