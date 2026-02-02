---
purpose: Anchor test suite for vault initialization and trade enforcement
related:
  - development/core-implementation
  - development/build-and-deploy
source_of_truth: true
code_files: []
last_verified: 2026-01-22
---

# Beneat Solana - Development Quickstart

> **TL;DR:** TypeScript test suite using Anchor and Chai to verify vault initialization and trade blocking when locked.

## Testing

### Basic Test (tests/beneat-solana.ts)

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BeneatSolana } from "../target/types/beneat_solana";
import { expect } from "chai";

describe("beneat-solana", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.BeneatSolana as Program<BeneatSolana>;
  const owner = provider.wallet;

  let vaultPDA: anchor.web3.PublicKey;
  let vaultBump: number;

  before(async () => {
    [vaultPDA, vaultBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), owner.publicKey.toBuffer()],
      program.programId
    );
  });

  it("Initializes vault", async () => {
    const lockoutDuration = 14400; // 4 hours

    await program.methods
      .initialize(lockoutDuration)
      .accounts({
        owner: owner.publicKey,
        vault: vaultPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const vault = await program.account.vault.fetch(vaultPDA);
    expect(vault.owner.toString()).to.equal(owner.publicKey.toString());
    expect(vault.isLocked).to.be.false;
    expect(vault.lockoutDuration).to.equal(lockoutDuration);
  });

  it("Blocks trades when locked", async () => {
    // First, manually lock the vault
    await program.methods
      .manualLock(3600) // 1 hour
      .accounts({
        owner: owner.publicKey,
        vault: vaultPDA,
      })
      .rpc();

    // Try to swap - should fail
    try {
      await program.methods
        .swapWithEnforcement(
          new anchor.BN(100000000), // 0.1 SOL
          new anchor.BN(0)
        )
        .accounts({
          owner: owner.publicKey,
          vault: vaultPDA,
        })
        .rpc();

      expect.fail("Should have thrown VaultLocked error");
    } catch (e: any) {
      expect(e.error.errorCode.code).to.equal("VaultLocked");
    }
  });
});
```
