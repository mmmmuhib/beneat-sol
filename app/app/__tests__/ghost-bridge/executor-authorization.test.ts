import { describe, it, expect } from "vitest";
import { PublicKey, Keypair } from "@solana/web3.js";
import {
  buildAuthorizeExecutorInstruction,
  deriveExecutorAuthorityPda,
  GHOST_BRIDGE_PROGRAM_ID,
} from "../../lib/ghost-bridge-instructions";

describe("Executor Authorization", () => {
  const owner = Keypair.generate();
  const teeExecutor = Keypair.generate();

  it("should build authorize_executor instruction correctly", async () => {
    const instruction = await buildAuthorizeExecutorInstruction(
      owner.publicKey,
      {
        executor: teeExecutor.publicKey,
        authorize: true,
      }
    );

    expect(instruction.programId.toBase58()).toBe(
      GHOST_BRIDGE_PROGRAM_ID.toBase58()
    );
    expect(instruction.keys).toHaveLength(2);
    expect(instruction.keys[0].pubkey.equals(owner.publicKey)).toBe(true);
    expect(instruction.keys[0].isSigner).toBe(true);
    expect(instruction.keys[0].isWritable).toBe(true);

    const [expectedExecutorAuth] = deriveExecutorAuthorityPda(owner.publicKey);
    expect(instruction.keys[1].pubkey.equals(expectedExecutorAuth)).toBe(true);
    expect(instruction.keys[1].isWritable).toBe(true);
  });

  it("should encode authorize=true correctly", async () => {
    const instruction = await buildAuthorizeExecutorInstruction(
      owner.publicKey,
      {
        executor: teeExecutor.publicKey,
        authorize: true,
      }
    );

    // Data: 8 bytes discriminator + 32 bytes executor + 1 byte authorize
    expect(instruction.data.length).toBe(41);
    expect(instruction.data[40]).toBe(1); // authorize = true
  });

  it("should encode authorize=false correctly", async () => {
    const instruction = await buildAuthorizeExecutorInstruction(
      owner.publicKey,
      {
        executor: teeExecutor.publicKey,
        authorize: false,
      }
    );

    expect(instruction.data[40]).toBe(0); // authorize = false
  });

  it("should include executor pubkey in instruction data", async () => {
    const instruction = await buildAuthorizeExecutorInstruction(
      owner.publicKey,
      {
        executor: teeExecutor.publicKey,
        authorize: true,
      }
    );

    // Executor pubkey starts at offset 8 (after discriminator)
    const encodedExecutor = new PublicKey(instruction.data.slice(8, 40));
    expect(encodedExecutor.equals(teeExecutor.publicKey)).toBe(true);
  });

  it("should derive correct executor authority PDA", () => {
    const [pda, bump] = deriveExecutorAuthorityPda(owner.publicKey);

    expect(pda).toBeInstanceOf(PublicKey);
    expect(bump).toBeGreaterThanOrEqual(0);
    expect(bump).toBeLessThanOrEqual(255);

    // PDA should be deterministic
    const [pda2] = deriveExecutorAuthorityPda(owner.publicKey);
    expect(pda.equals(pda2)).toBe(true);
  });
});
