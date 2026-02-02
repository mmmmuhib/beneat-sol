---
purpose: Required environment variables for frontend configuration
related:
  - development/setup
  - development/frontend-integration
source_of_truth: true
code_files: []
last_verified: 2026-01-22
---

# Beneat Solana - Development Quickstart

> **TL;DR:** Configure `.env.local` with Helius API key, RPC URL, and program ID for the frontend.

## Environment Variables

```bash
# .env.local (frontend)
NEXT_PUBLIC_HELIUS_KEY=your_helius_api_key
NEXT_PUBLIC_RPC_URL=https://devnet.helius-rpc.com/?api-key=your_key
NEXT_PUBLIC_PROGRAM_ID=BENEAT111111111111111111111111111111111111111
```
