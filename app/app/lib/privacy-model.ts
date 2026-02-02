/**
 * MagicBlock Ephemeral Rollups Privacy Model
 *
 * This module documents the HONEST privacy guarantees of MagicBlock ER.
 * Critical: MagicBlock provides mempool privacy, NOT account data privacy.
 *
 * What IS protected:
 * - Transaction submission timing (mempool privacy)
 * - Exact moment of state transitions until commit
 *
 * What is NOT protected:
 * - Account data (trigger_price, order_side, size) remains readable
 * - Final Drift trades on L1
 */

export const MAGICBLOCK_PRIVACY_MODEL = {
  PROTECTED: {
    MEMPOOL_PRIVACY: {
      description: "Pending transactions hidden from mempool observers",
      attackVectorMitigated: "Front-running of ghost orders during submission",
      verifiableInE2E: false,
      note: "Cannot verify in E2E tests - requires mempool inspection tools",
    },
    EXECUTION_TIMING: {
      description: "Exact moment of state transitions hidden until commit",
      attackVectorMitigated: "Timing correlation attacks",
      verifiableInE2E: true,
      note: "Can verify by comparing ER vs base layer status",
    },
    DELEGATION_OWNERSHIP: {
      description: "Account ownership transfers to DELEGATION_PROGRAM_ID",
      attackVectorMitigated: "Direct account modification by unauthorized parties",
      verifiableInE2E: true,
      note: "Can verify account.owner equals delegation program",
    },
  },
  NOT_PROTECTED: {
    ACCOUNT_DATA_WHILE_DELEGATED: {
      description: "Account data remains fully readable on base layer even when delegated",
      exposedFields: [
        "trigger_price",
        "order_side",
        "base_asset_amount",
        "market_index",
        "trigger_condition",
        "reduce_only",
        "expiry",
        "feed_id",
        "owner",
      ],
      reason: "Delegation transfers ownership, not data encryption",
      attackVectorRemaining: "Attacker can see order parameters and prepare response",
    },
    FINAL_STATE_POST_COMMIT: {
      description: "All account data visible after commit/undelegate",
      exposedFields: "All GhostOrder fields including execution_price, executed_at",
      reason: "Commit synchronizes ER state to base layer",
      attackVectorRemaining: "Post-execution analysis possible",
    },
    DRIFT_TRADE_EXECUTION: {
      description: "Drift protocol trades are always visible on L1",
      reason: "Magic Action CPI executes on base layer",
      attackVectorRemaining: "Trade history fully traceable",
    },
  },
} as const;

export type PrivacyAssessment = "full" | "partial" | "minimal" | "none";

export const SENSITIVE_GHOST_ORDER_FIELDS = [
  "trigger_price",
  "order_side",
  "base_asset_amount",
  "market_index",
  "trigger_condition",
  "reduce_only",
  "expiry",
  "feed_id",
] as const;

export type SensitiveField = (typeof SENSITIVE_GHOST_ORDER_FIELDS)[number];

export interface FieldExposure {
  field: SensitiveField | string;
  baseLayerValue: string | number | boolean | null;
  isReadable: boolean;
}

export interface PrivacyMetrics {
  readableFieldCount: number;
  totalSensitiveFields: number;
  percentFieldsProtected: number;
  attackVectorsMitigated: string[];
  attackVectorsRemaining: string[];
}

export function calculatePrivacyAssessment(
  delegationVerified: boolean,
  statusDiffers: boolean,
  readableFieldCount: number,
  totalFields: number
): PrivacyAssessment {
  const percentProtected = ((totalFields - readableFieldCount) / totalFields) * 100;

  if (!delegationVerified) {
    return "none";
  }

  if (percentProtected > 80) {
    return "full";
  }

  if (percentProtected > 40 || statusDiffers) {
    return "partial";
  }

  return "minimal";
}

export function getAttackVectorsMitigated(delegationVerified: boolean): string[] {
  if (!delegationVerified) {
    return [];
  }

  return [
    "Transaction front-running during mempool phase",
    "Exact execution timing prediction",
    "Unauthorized account modification",
  ];
}

export function getAttackVectorsRemaining(readableFields: FieldExposure[]): string[] {
  const vectors: string[] = [];

  const readable = readableFields.filter((f) => f.isReadable);

  if (readable.some((f) => f.field === "trigger_price")) {
    vectors.push("Trigger price detection (readable on base layer)");
  }

  if (readable.some((f) => f.field === "order_side")) {
    vectors.push("Order direction prediction (order_side readable)");
  }

  if (readable.some((f) => f.field === "base_asset_amount")) {
    vectors.push("Position size detection (base_asset_amount readable)");
  }

  if (readable.some((f) => f.field === "market_index")) {
    vectors.push("Target market identification (market_index readable)");
  }

  if (readable.length > 0) {
    vectors.push("Order parameter analysis for strategic positioning");
  }

  return vectors;
}

export function generatePrivacyRecommendations(
  assessment: PrivacyAssessment,
  readableFieldCount: number
): string[] {
  const recommendations: string[] = [];

  if (readableFieldCount > 0) {
    recommendations.push("Consider Light Protocol ZK compression for account data encryption");
    recommendations.push("MagicBlock ER protects mempool submission, not stored account data");
  }

  if (assessment === "minimal" || assessment === "none") {
    recommendations.push("Current privacy level prevents front-running but not parameter analysis");
    recommendations.push("For full privacy, encrypt sensitive fields before on-chain storage");
  }

  if (assessment === "none") {
    recommendations.push("CRITICAL: Account must be delegated for any privacy benefits");
  }

  return recommendations;
}
