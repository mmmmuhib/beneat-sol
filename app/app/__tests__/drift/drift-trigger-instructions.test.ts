import { describe, expect, it } from "vitest";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import {
  buildPlaceTriggerOrderInstruction,
  inferTriggerCondition,
  TRIGGER_CONDITION_VALUES,
} from "../../lib/drift-instructions";

describe("drift trigger instructions", () => {
  it("inferTriggerCondition(stop_loss,long) => below", () => {
    expect(inferTriggerCondition("stop_loss", "long")).toBe("below");
  });

  it("inferTriggerCondition(stop_loss,short) => above", () => {
    expect(inferTriggerCondition("stop_loss", "short")).toBe("above");
  });

  it("inferTriggerCondition(take_profit,long) => above", () => {
    expect(inferTriggerCondition("take_profit", "long")).toBe("above");
  });

  it("inferTriggerCondition(take_profit,short) => below", () => {
    expect(inferTriggerCondition("take_profit", "short")).toBe("below");
  });

  it("buildPlaceTriggerOrderInstruction encodes trigger fields", () => {
    const authority = new PublicKey("11111111111111111111111111111111");
    const userPDA = new PublicKey("11111111111111111111111111111111");

    const triggerPrice = new BN(123_456_789);

    const ix = buildPlaceTriggerOrderInstruction({
      marketIndex: 0,
      baseAssetAmount: new BN(1_000_000),
      direction: "long",
      triggerPrice,
      triggerCondition: "below",
      userPDA,
      authority,
    });

    // orderType byte at offset 1 is triggerMarket (2)
    expect(ix.data.readUInt8(1)).toBe(2);

    // reduceOnly flag at offset 21 is true
    expect(ix.data.readUInt8(21)).toBe(1);

    // triggerPrice at offset 24 (u64 LE)
    const encodedTriggerPrice = ix.data.readBigUInt64LE(24);
    expect(encodedTriggerPrice).toBe(BigInt(triggerPrice.toString()));

    // triggerCondition at offset 32
    expect(ix.data.readUInt8(32)).toBe(TRIGGER_CONDITION_VALUES.below);
  });
});
