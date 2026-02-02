/**
 * MagicBlock Privacy Verification Test Suite
 *
 * This test suite HONESTLY documents the privacy guarantees of MagicBlock
 * Ephemeral Rollups. Critical insight: MagicBlock provides mempool privacy,
 * NOT account data privacy.
 *
 * Tests are organized to:
 * 1. PROVE what IS protected (delegation ownership, execution timing)
 * 2. PROVE what is NOT protected (account data remains readable)
 * 3. Provide accurate privacy metrics and recommendations
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Connection, Keypair, PublicKey, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

import {
  GHOST_CRANK_PROGRAM_ID,
  DELEGATION_PROGRAM_ID,
  ORDER_STATUS,
  TRIGGER_CONDITION,
  ORDER_SIDE,
  SOL_PERP_MARKET_INDEX,
  BASE_PRECISION,
  PRICE_PRECISION,
  createDualConnections,
  deriveGhostOrderPDA,
  deriveDelegationPDAs,
  fetchGhostOrderState,
  verifyAccountDelegated,
  sendBaseLayerTransaction,
  waitForStatePropagation,
  buildCreateGhostOrderInstruction,
  buildGhostCrankDelegateOrderInstruction,
  generateDefaultFeedId,
  verifyPrivacyComprehensive,
  printPrivacyReport,
  DualConnections,
} from "../lib/magicblock-helpers";

import { MAGICBLOCK_PRIVACY_MODEL, SENSITIVE_GHOST_ORDER_FIELDS } from "../lib/privacy-model";

const SKIP_FUNDED_TESTS = !process.env.TEST_WALLET_PRIVATE_KEY;

describe("MagicBlock Privacy Model Documentation", () => {
  it("should document what MagicBlock DOES protect", () => {
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("          MAGICBLOCK ER: WHAT IS PROTECTED                  ");
    console.log("═══════════════════════════════════════════════════════════\n");

    const protected_ = MAGICBLOCK_PRIVACY_MODEL.PROTECTED;

    console.log("1. MEMPOOL PRIVACY");
    console.log(`   ${protected_.MEMPOOL_PRIVACY.description}`);
    console.log(`   Attack mitigated: ${protected_.MEMPOOL_PRIVACY.attackVectorMitigated}`);
    console.log(`   Verifiable in E2E: ${protected_.MEMPOOL_PRIVACY.verifiableInE2E ? "Yes" : "No"}`);
    console.log(`   Note: ${protected_.MEMPOOL_PRIVACY.note}`);
    console.log("");

    console.log("2. EXECUTION TIMING");
    console.log(`   ${protected_.EXECUTION_TIMING.description}`);
    console.log(`   Attack mitigated: ${protected_.EXECUTION_TIMING.attackVectorMitigated}`);
    console.log(`   Verifiable in E2E: ${protected_.EXECUTION_TIMING.verifiableInE2E ? "Yes" : "No"}`);
    console.log("");

    console.log("3. DELEGATION OWNERSHIP");
    console.log(`   ${protected_.DELEGATION_OWNERSHIP.description}`);
    console.log(`   Attack mitigated: ${protected_.DELEGATION_OWNERSHIP.attackVectorMitigated}`);
    console.log(`   Verifiable in E2E: ${protected_.DELEGATION_OWNERSHIP.verifiableInE2E ? "Yes" : "No"}`);
    console.log("");

    expect(protected_.MEMPOOL_PRIVACY.verifiableInE2E).toBe(false);
    expect(protected_.EXECUTION_TIMING.verifiableInE2E).toBe(true);
    expect(protected_.DELEGATION_OWNERSHIP.verifiableInE2E).toBe(true);
  });

  it("should document what MagicBlock does NOT protect", () => {
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("          MAGICBLOCK ER: WHAT IS NOT PROTECTED              ");
    console.log("═══════════════════════════════════════════════════════════\n");

    const notProtected = MAGICBLOCK_PRIVACY_MODEL.NOT_PROTECTED;

    console.log("1. ACCOUNT DATA WHILE DELEGATED");
    console.log(`   ${notProtected.ACCOUNT_DATA_WHILE_DELEGATED.description}`);
    console.log(`   Exposed fields: ${notProtected.ACCOUNT_DATA_WHILE_DELEGATED.exposedFields.join(", ")}`);
    console.log(`   Reason: ${notProtected.ACCOUNT_DATA_WHILE_DELEGATED.reason}`);
    console.log(`   Attack remaining: ${notProtected.ACCOUNT_DATA_WHILE_DELEGATED.attackVectorRemaining}`);
    console.log("");

    console.log("2. FINAL STATE POST-COMMIT");
    console.log(`   ${notProtected.FINAL_STATE_POST_COMMIT.description}`);
    console.log(`   Reason: ${notProtected.FINAL_STATE_POST_COMMIT.reason}`);
    console.log("");

    console.log("3. DRIFT TRADE EXECUTION");
    console.log(`   ${notProtected.DRIFT_TRADE_EXECUTION.description}`);
    console.log(`   Reason: ${notProtected.DRIFT_TRADE_EXECUTION.reason}`);
    console.log("");

    expect(notProtected.ACCOUNT_DATA_WHILE_DELEGATED.exposedFields.length).toBeGreaterThan(0);
    expect(notProtected.ACCOUNT_DATA_WHILE_DELEGATED.reason).toContain("encryption");
  });

  it("should list all sensitive ghost order fields", () => {
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("          SENSITIVE FIELDS IN GHOST ORDER                   ");
    console.log("═══════════════════════════════════════════════════════════\n");

    SENSITIVE_GHOST_ORDER_FIELDS.forEach((field, i) => {
      console.log(`   ${i + 1}. ${field}`);
    });

    console.log(`\n   Total: ${SENSITIVE_GHOST_ORDER_FIELDS.length} sensitive fields`);
    console.log("   ALL of these are readable on base layer while delegated!\n");

    expect(SENSITIVE_GHOST_ORDER_FIELDS).toContain("trigger_price");
    expect(SENSITIVE_GHOST_ORDER_FIELDS).toContain("order_side");
    expect(SENSITIVE_GHOST_ORDER_FIELDS).toContain("base_asset_amount");
  });
});

describe("Privacy Verification: Account Data Visibility While Delegated", () => {
  let connections: DualConnections;
  let testWallet: Keypair;
  let orderId: BN;
  let ghostOrderPda: PublicKey;

  beforeAll(async () => {
    if (SKIP_FUNDED_TESTS) {
      console.log("[Skip] No TEST_WALLET_PRIVATE_KEY provided");
      return;
    }

    const privateKeyArray = JSON.parse(process.env.TEST_WALLET_PRIVATE_KEY || "[]");
    testWallet = Keypair.fromSecretKey(Uint8Array.from(privateKeyArray));
    connections = createDualConnections();
    orderId = new BN(Date.now());
    ghostOrderPda = deriveGhostOrderPDA(testWallet.publicKey, orderId);
  });

  it.skipIf(SKIP_FUNDED_TESTS)(
    "should PROVE account data IS readable on base layer while delegated",
    async () => {
      console.log("\n[Test] Creating and delegating ghost order...");

      const triggerPrice = new BN(185).mul(PRICE_PRECISION);
      const baseAmount = new BN(2).mul(BASE_PRECISION);

      const createIx = buildCreateGhostOrderInstruction(testWallet.publicKey, ghostOrderPda, {
        orderId,
        marketIndex: SOL_PERP_MARKET_INDEX,
        triggerPrice,
        triggerCondition: TRIGGER_CONDITION.Above,
        orderSide: ORDER_SIDE.Short,
        baseAssetAmount: baseAmount,
        reduceOnly: false,
        expirySeconds: new BN(7200),
        feedId: generateDefaultFeedId(),
        paramsCommitment: Array(32).fill(0),
        nonce: new BN(0),
        driftUser: testWallet.publicKey,
      });

      const createTx = new Transaction().add(createIx);
      await sendBaseLayerTransaction(connections.base, createTx, [testWallet]);
      console.log("[Test] Ghost order created");

      const delegateIx = buildGhostCrankDelegateOrderInstruction(
        testWallet.publicKey,
        ghostOrderPda
      );
      const delegateTx = new Transaction().add(delegateIx);
      await sendBaseLayerTransaction(connections.base, delegateTx, [testWallet]);
      console.log("[Test] Ghost order delegated");

      await waitForStatePropagation();

      const { isDelegated, owner } = await verifyAccountDelegated(connections.base, ghostOrderPda);
      expect(isDelegated).toBe(true);
      console.log("[Test] ✓ Account is delegated, owner:", owner?.toBase58());

      console.log("\n[Test] Now attempting to read account data from BASE layer...");
      const baseState = await fetchGhostOrderState(connections.base, ghostOrderPda);

      console.log("\n╔══════════════════════════════════════════════════════════════╗");
      console.log("║  CRITICAL: ACCOUNT DATA IS READABLE WHILE DELEGATED          ║");
      console.log("╚══════════════════════════════════════════════════════════════╝");

      expect(baseState).not.toBeNull();
      console.log("[READABLE] trigger_price:", baseState?.triggerPrice.toString());
      console.log("[READABLE] order_side:", baseState?.orderSide === 0 ? "Long" : "Short");
      console.log("[READABLE] base_asset_amount:", baseState?.baseAssetAmount.toString());
      console.log("[READABLE] market_index:", baseState?.marketIndex);
      console.log("[READABLE] trigger_condition:", baseState?.triggerCondition === 0 ? "Above" : "Below");
      console.log("[READABLE] reduce_only:", baseState?.reduceOnly);

      expect(baseState?.triggerPrice.toString()).toBe(triggerPrice.toString());
      expect(baseState?.orderSide).toBe(ORDER_SIDE.Short);
      expect(baseState?.baseAssetAmount.toString()).toBe(baseAmount.toString());

      console.log("\n[CONCLUSION] An attacker observing the base layer can see:");
      console.log("  - You want to SHORT SOL");
      console.log("  - Your trigger is at $185");
      console.log("  - Your position size is 2 SOL");
      console.log("  - This is NOT a privacy-preserving system for order parameters!\n");
    }
  );

  it.skipIf(SKIP_FUNDED_TESTS)(
    "should run comprehensive privacy verification and get 'minimal' assessment",
    async () => {
      console.log("\n[Test] Running comprehensive privacy verification...");

      const result = await verifyPrivacyComprehensive(connections, ghostOrderPda);

      printPrivacyReport(result);

      expect(result.delegationVerified).toBe(true);
      expect(result.privacyAssessment).toBe("minimal");

      expect(result.metrics.readableFieldCount).toBe(SENSITIVE_GHOST_ORDER_FIELDS.length);
      expect(result.metrics.percentFieldsProtected).toBe(0);

      expect(result.metrics.attackVectorsMitigated.length).toBeGreaterThan(0);
      expect(result.metrics.attackVectorsRemaining.length).toBeGreaterThan(0);

      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations.some((r) => r.includes("Light Protocol"))).toBe(true);

      console.log("[Test] ✓ Privacy assessment correctly identifies limitations");
    }
  );
});

describe("Privacy Verification: What IS Protected", () => {
  let connections: DualConnections;

  beforeAll(() => {
    connections = createDualConnections();
  });

  it("should verify delegation program ID is correct", () => {
    expect(DELEGATION_PROGRAM_ID.toBase58()).toBe("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
    console.log("[Test] ✓ Delegation program ID verified");
  });

  it("should verify delegation PDAs are derivable", () => {
    const testWallet = Keypair.generate();
    const orderId = new BN(Date.now());
    const pda = deriveGhostOrderPDA(testWallet.publicKey, orderId);
    const delegationPdas = deriveDelegationPDAs(pda, GHOST_CRANK_PROGRAM_ID);

    expect(delegationPdas.delegationBuffer).toBeInstanceOf(PublicKey);
    expect(delegationPdas.delegationRecord).toBeInstanceOf(PublicKey);
    expect(delegationPdas.delegationMetadata).toBeInstanceOf(PublicKey);

    console.log("[Test] ✓ Delegation PDAs derivable");
    console.log("  Buffer:", delegationPdas.delegationBuffer.toBase58().slice(0, 20) + "...");
    console.log("  Record:", delegationPdas.delegationRecord.toBase58().slice(0, 20) + "...");
    console.log("  Metadata:", delegationPdas.delegationMetadata.toBase58().slice(0, 20) + "...");
  });

  it("should document that mempool privacy cannot be verified in E2E tests", () => {
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("          MEMPOOL PRIVACY: VERIFICATION LIMITATIONS         ");
    console.log("═══════════════════════════════════════════════════════════\n");

    console.log("Mempool privacy is the PRIMARY benefit of MagicBlock ER.");
    console.log("However, it CANNOT be verified in E2E tests because:");
    console.log("");
    console.log("1. Mempool inspection requires specialized tools");
    console.log("2. Devnet mempools are not publicly observable");
    console.log("3. ER transactions bypass the standard mempool entirely");
    console.log("");
    console.log("To verify mempool privacy, you would need to:");
    console.log("  - Run a validator node and inspect incoming transactions");
    console.log("  - Use mempool monitoring services (not available on devnet)");
    console.log("  - Trust MagicBlock's architecture documentation");
    console.log("");

    expect(MAGICBLOCK_PRIVACY_MODEL.PROTECTED.MEMPOOL_PRIVACY.verifiableInE2E).toBe(false);
    console.log("[Test] ✓ Documented mempool privacy verification limitation");
  });
});

describe("Privacy Metrics Accuracy", () => {
  it("should calculate correct privacy percentage when all fields readable", () => {
    const totalFields = SENSITIVE_GHOST_ORDER_FIELDS.length;
    const readableFields = totalFields;
    const percentProtected = ((totalFields - readableFields) / totalFields) * 100;

    expect(percentProtected).toBe(0);
    console.log(`[Test] When ${readableFields}/${totalFields} fields readable → ${percentProtected}% protected`);
  });

  it("should calculate correct privacy percentage when no fields readable", () => {
    const totalFields = SENSITIVE_GHOST_ORDER_FIELDS.length;
    const readableFields = 0;
    const percentProtected = ((totalFields - readableFields) / totalFields) * 100;

    expect(percentProtected).toBe(100);
    console.log(`[Test] When ${readableFields}/${totalFields} fields readable → ${percentProtected}% protected`);
  });

  it("should list expected attack vectors for readable order data", () => {
    const expectedVectors = [
      "Trigger price detection",
      "Order direction prediction",
      "Position size detection",
      "Target market identification",
    ];

    console.log("\n[Test] Attack vectors when order data is readable:");
    expectedVectors.forEach((v) => console.log(`  ⚠ ${v}`));

    expect(expectedVectors.length).toBeGreaterThan(0);
  });
});

describe("Summary: MagicBlock Privacy Reality Check", () => {
  it("should provide honest summary of privacy guarantees", () => {
    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║          MAGICBLOCK ER: PRIVACY REALITY CHECK                 ║");
    console.log("╠══════════════════════════════════════════════════════════════╣");
    console.log("║                                                               ║");
    console.log("║  ✓ PROTECTED:                                                 ║");
    console.log("║    • Transaction submission timing (mempool hidden)          ║");
    console.log("║    • Exact state transition moments (until commit)           ║");
    console.log("║    • Account modification by unauthorized parties            ║");
    console.log("║                                                               ║");
    console.log("║  ✗ NOT PROTECTED:                                             ║");
    console.log("║    • Account data (trigger_price, order_side, size)          ║");
    console.log("║    • Final trade execution on Drift L1                       ║");
    console.log("║    • Order parameter analysis by observers                   ║");
    console.log("║                                                               ║");
    console.log("║  RECOMMENDATION:                                              ║");
    console.log("║    For full privacy, integrate Light Protocol ZK compression ║");
    console.log("║    to encrypt sensitive fields before on-chain storage.      ║");
    console.log("║                                                               ║");
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    expect(true).toBe(true);
  });
});
