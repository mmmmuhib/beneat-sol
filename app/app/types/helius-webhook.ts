export interface HeliusWebhookPayload {
  accountData: Array<{
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges: Array<{
      mint: string;
      rawTokenAmount: {
        tokenAmount: string;
        decimals: number;
      };
      userAccount: string;
    }>;
  }>;
  description: string;
  events: {
    compressed?: {
      type: string;
      treeId: string;
      assetId: string;
      leafIndex: number;
      newLeafOwner?: string;
    };
    swap?: {
      tokenInputs: Array<{ mint: string; amount: string }>;
      tokenOutputs: Array<{ mint: string; amount: string }>;
    };
  };
  fee: number;
  feePayer: string;
  signature: string;
  slot: number;
  timestamp: number;
  type: string;
}

export interface VaultEvent {
  type: "LOCKOUT_TRIGGERED" | "LOCKOUT_CLEARED" | "DEPOSIT" | "WITHDRAWAL" | "TRADE";
  signature: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface WebhookState {
  lastEvent: VaultEvent | null;
  events: VaultEvent[];
  isLocked: boolean;
  lockoutTimestamp: number | null;
}
