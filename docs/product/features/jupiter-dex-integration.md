---
purpose: Overview of Jupiter DEX integration for swap execution through the vault
related:
  - product/features/vault-system
  - product/features/auto-lockout-system
  - technical/integrations/jupiter
source_of_truth: false
code_files: []
last_verified: 2026-01-22
---

# Beneat Solana: Privacy-Preserving Risk Enforcement

> **TL;DR:** All trades execute through Jupiter DEX using a split instruction pattern (`pre_swap_check` → Jupiter → `post_swap_update`) within a single atomic transaction, enabling rule enforcement and P&L tracking around each swap.

# Jupiter DEX Integration

See [[technical/integrations/jupiter]] for full details.
