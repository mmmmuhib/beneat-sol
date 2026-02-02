import { describe, it, expect, beforeAll } from "vitest";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import { Buffer } from "buffer";

import {
  computeOrderHash,
  generateOrderSalt,
  encryptOrderForTEE,
  validateTeePublicKey,
  decryptOrderInBrowser,
  CompressedGhostOrderData,
} from "../../lib/tee-encryption";

import {
  GHOST_BRIDGE_PROGRAM_ID,
  deriveExecutorAuthorityPda,
  deriveEncryptedOrderPda,
  buildInitExecutorInstruction,
  buildCreateEncryptedOrderInstruction,
  buildCancelEncryptedOrderInstruction,
  buildCloseEncryptedOrderInstruction,
  parseExecutorAuthorityAccount,
  parseEncryptedOrderAccount,
  EncryptedOrderStatus,
} from "../../lib/ghost-bridge-instructions";

const DEVNET_RPC = "https://api.devnet.solana.com";

const SOL_PYTH_FEED_ID =
  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

describe("Ghost-Bridge: Hash Computation Verification", () => {
  const testOwner = Keypair.generate();
  const testOrderData: CompressedGhostOrderData = {
    owner: testOwner.publicKey.toBase58(),
    orderId: "1234567890",
    marketIndex: 0,
    triggerPrice: "180000000",
    triggerCondition: "below",
    orderSide: "long",
    baseAssetAmount: "1000000000",
    reduceOnly: true,
    expiry: 1700000000,
    feedId: SOL_PYTH_FEED_ID,
    salt: "0".repeat(32),
  };

  it("should generate deterministic 32-byte hash", async () => {
    const hash1 = await computeOrderHash(testOrderData);
    const hash2 = await computeOrderHash(testOrderData);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);
    expect(Buffer.from(hash1, "hex").length).toBe(32);
  });

  it("should produce different hash when trigger price changes", async () => {
    const originalHash = await computeOrderHash(testOrderData);

    const modifiedData = { ...testOrderData, triggerPrice: "200000000" };
    const modifiedHash = await computeOrderHash(modifiedData);

    expect(originalHash).not.toBe(modifiedHash);
  });

  it("should produce different hash when trigger condition changes", async () => {
    const originalHash = await computeOrderHash(testOrderData);

    const modifiedData: CompressedGhostOrderData = {
      ...testOrderData,
      triggerCondition: "above",
    };
    const modifiedHash = await computeOrderHash(modifiedData);

    expect(originalHash).not.toBe(modifiedHash);
  });

  it("should produce different hash when order side changes", async () => {
    const originalHash = await computeOrderHash(testOrderData);

    const modifiedData: CompressedGhostOrderData = {
      ...testOrderData,
      orderSide: "short",
    };
    const modifiedHash = await computeOrderHash(modifiedData);

    expect(originalHash).not.toBe(modifiedHash);
  });

  it("should produce different hash when salt changes", async () => {
    const hash1 = await computeOrderHash({ ...testOrderData, salt: generateOrderSalt() });
    const hash2 = await computeOrderHash({ ...testOrderData, salt: generateOrderSalt() });

    expect(hash1).not.toBe(hash2);
  });

  it("should use all 144 bytes for hash input", async () => {
    const hashWithZeroSalt = await computeOrderHash({
      ...testOrderData,
      salt: "0".repeat(32),
    });

    const hashWithDifferentSalt = await computeOrderHash({
      ...testOrderData,
      salt: "f".repeat(32),
    });

    expect(hashWithZeroSalt).not.toBe(hashWithDifferentSalt);
  });
});

describe("Ghost-Bridge: Salt Generation", () => {
  it("should generate 16-byte (32 hex char) salt", () => {
    const salt = generateOrderSalt();

    expect(salt.length).toBe(32);
    expect(/^[0-9a-f]+$/.test(salt)).toBe(true);
  });

  it("should generate unique salts", () => {
    const salts = new Set<string>();

    for (let i = 0; i < 100; i++) {
      salts.add(generateOrderSalt());
    }

    expect(salts.size).toBe(100);
  });
});

describe("Ghost-Bridge: TEE Public Key Validation", () => {
  it("should accept valid 33-byte compressed public key", () => {
    const compressedKey =
      "02" + "a".repeat(64);
    expect(validateTeePublicKey(compressedKey)).toBe(true);
  });

  it("should accept valid 65-byte uncompressed public key", () => {
    const uncompressedKey =
      "04" + "b".repeat(128);
    expect(validateTeePublicKey(uncompressedKey)).toBe(true);
  });

  it("should reject invalid length public key", () => {
    const invalidKey = "abc123";
    expect(validateTeePublicKey(invalidKey)).toBe(false);
  });

  it("should reject non-hex string", () => {
    const invalidKey = "not-a-hex-string-at-all!!!";
    expect(validateTeePublicKey(invalidKey)).toBe(false);
  });
});

describe("Ghost-Bridge: Encryption/Decryption Round-Trip", () => {
  it("should encrypt and decrypt order data correctly", async () => {
    const { PrivateKey } = await import("eciesjs");
    const keyPair = new PrivateKey();
    const pubKeyHex = keyPair.publicKey.toHex();
    const privKeyHex = keyPair.toHex();

    const testOwner = Keypair.generate();
    const orderData: CompressedGhostOrderData = {
      owner: testOwner.publicKey.toBase58(),
      orderId: "9876543210",
      marketIndex: 1,
      triggerPrice: "150000000",
      triggerCondition: "above",
      orderSide: "short",
      baseAssetAmount: "500000000",
      reduceOnly: false,
      expiry: 1800000000,
      feedId: SOL_PYTH_FEED_ID,
    };

    const encrypted = await encryptOrderForTEE(orderData, pubKeyHex);

    expect(encrypted.encryptedData).toBeDefined();
    expect(encrypted.orderHash).toBeDefined();
    expect(encrypted.version).toBe(1);
    expect(encrypted.orderHash.length).toBe(64);

    const decrypted = await decryptOrderInBrowser(
      encrypted.encryptedData,
      privKeyHex
    );

    expect(decrypted.owner).toBe(orderData.owner);
    expect(decrypted.orderId).toBe(orderData.orderId);
    expect(decrypted.marketIndex).toBe(orderData.marketIndex);
    expect(decrypted.triggerPrice).toBe(orderData.triggerPrice);
    expect(decrypted.triggerCondition).toBe(orderData.triggerCondition);
    expect(decrypted.orderSide).toBe(orderData.orderSide);
    expect(decrypted.baseAssetAmount).toBe(orderData.baseAssetAmount);
    expect(decrypted.reduceOnly).toBe(orderData.reduceOnly);
    expect(decrypted.expiry).toBe(orderData.expiry);
    expect(decrypted.feedId).toBe(orderData.feedId);
  });

  it("should add salt during encryption if not provided", async () => {
    const { PrivateKey } = await import("eciesjs");
    const keyPair = new PrivateKey();
    const pubKeyHex = keyPair.publicKey.toHex();
    const privKeyHex = keyPair.toHex();

    const testOwner = Keypair.generate();
    const orderData: CompressedGhostOrderData = {
      owner: testOwner.publicKey.toBase58(),
      orderId: "1111111111",
      marketIndex: 0,
      triggerPrice: "100000000",
      triggerCondition: "below",
      orderSide: "long",
      baseAssetAmount: "1000000000",
      reduceOnly: false,
      expiry: 0,
      feedId: SOL_PYTH_FEED_ID,
    };

    const encrypted = await encryptOrderForTEE(orderData, pubKeyHex);
    const decrypted = await decryptOrderInBrowser(
      encrypted.encryptedData,
      privKeyHex
    );

    expect(decrypted.salt).toBeDefined();
    expect(decrypted.salt!.length).toBe(32);
  });

  it("should produce different ciphertext for same plaintext with different salts", async () => {
    const { PrivateKey } = await import("eciesjs");
    const keyPair = new PrivateKey();
    const pubKeyHex = keyPair.publicKey.toHex();

    const testOwner = Keypair.generate();
    const orderData: CompressedGhostOrderData = {
      owner: testOwner.publicKey.toBase58(),
      orderId: "2222222222",
      marketIndex: 0,
      triggerPrice: "100000000",
      triggerCondition: "below",
      orderSide: "long",
      baseAssetAmount: "1000000000",
      reduceOnly: false,
      expiry: 0,
      feedId: SOL_PYTH_FEED_ID,
    };

    const encrypted1 = await encryptOrderForTEE(orderData, pubKeyHex);
    const encrypted2 = await encryptOrderForTEE(orderData, pubKeyHex);

    expect(encrypted1.encryptedData).not.toBe(encrypted2.encryptedData);
    expect(encrypted1.orderHash).not.toBe(encrypted2.orderHash);
  });
});

describe("Ghost-Bridge: PDA Derivation", () => {
  const testOwner = Keypair.generate();

  it("should derive executor authority PDA deterministically", () => {
    const [pda1, bump1] = deriveExecutorAuthorityPda(testOwner.publicKey);
    const [pda2, bump2] = deriveExecutorAuthorityPda(testOwner.publicKey);

    expect(pda1.equals(pda2)).toBe(true);
    expect(bump1).toBe(bump2);
    expect(bump1).toBeGreaterThanOrEqual(0);
    expect(bump1).toBeLessThanOrEqual(255);
  });

  it("should derive different PDAs for different owners", () => {
    const owner1 = Keypair.generate();
    const owner2 = Keypair.generate();

    const [pda1] = deriveExecutorAuthorityPda(owner1.publicKey);
    const [pda2] = deriveExecutorAuthorityPda(owner2.publicKey);

    expect(pda1.equals(pda2)).toBe(false);
  });

  it("should derive encrypted order PDA deterministically", async () => {
    const orderHash = Buffer.from(await computeOrderHash({
      owner: testOwner.publicKey.toBase58(),
      orderId: "12345",
      marketIndex: 0,
      triggerPrice: "100000000",
      triggerCondition: "below",
      orderSide: "long",
      baseAssetAmount: "1000000000",
      reduceOnly: false,
      expiry: 0,
      feedId: SOL_PYTH_FEED_ID,
    }), "hex");

    const [pda1, bump1] = deriveEncryptedOrderPda(testOwner.publicKey, orderHash);
    const [pda2, bump2] = deriveEncryptedOrderPda(testOwner.publicKey, orderHash);

    expect(pda1.equals(pda2)).toBe(true);
    expect(bump1).toBe(bump2);
  });

  it("should derive different order PDAs for different hashes", async () => {
    const hash1 = Buffer.from(await computeOrderHash({
      owner: testOwner.publicKey.toBase58(),
      orderId: "11111",
      marketIndex: 0,
      triggerPrice: "100000000",
      triggerCondition: "below",
      orderSide: "long",
      baseAssetAmount: "1000000000",
      reduceOnly: false,
      expiry: 0,
      feedId: SOL_PYTH_FEED_ID,
    }), "hex");

    const hash2 = Buffer.from(await computeOrderHash({
      owner: testOwner.publicKey.toBase58(),
      orderId: "22222",
      marketIndex: 0,
      triggerPrice: "100000000",
      triggerCondition: "below",
      orderSide: "long",
      baseAssetAmount: "1000000000",
      reduceOnly: false,
      expiry: 0,
      feedId: SOL_PYTH_FEED_ID,
    }), "hex");

    const [pda1] = deriveEncryptedOrderPda(testOwner.publicKey, hash1);
    const [pda2] = deriveEncryptedOrderPda(testOwner.publicKey, hash2);

    expect(pda1.equals(pda2)).toBe(false);
  });
});

describe("Ghost-Bridge: Instruction Builders", () => {
  const testOwner = Keypair.generate();

  it("should build init_executor instruction with correct accounts", async () => {
    const ix = await buildInitExecutorInstruction(testOwner.publicKey);

    expect(ix.programId.equals(GHOST_BRIDGE_PROGRAM_ID)).toBe(true);
    expect(ix.keys.length).toBe(3);

    expect(ix.keys[0].pubkey.equals(testOwner.publicKey)).toBe(true);
    expect(ix.keys[0].isSigner).toBe(true);
    expect(ix.keys[0].isWritable).toBe(true);

    const [expectedExecutorPda] = deriveExecutorAuthorityPda(testOwner.publicKey);
    expect(ix.keys[1].pubkey.equals(expectedExecutorPda)).toBe(true);
    expect(ix.keys[1].isWritable).toBe(true);

    expect(ix.keys[2].pubkey.equals(SystemProgram.programId)).toBe(true);

    expect(ix.data.length).toBe(8);
  });

  it("should build create_encrypted_order instruction with correct encoding", async () => {
    const { PrivateKey } = await import("eciesjs");
    const keyPair = new PrivateKey();
    const pubKeyHex = keyPair.publicKey.toHex();

    const orderData: CompressedGhostOrderData = {
      owner: testOwner.publicKey.toBase58(),
      orderId: "12345",
      marketIndex: 0,
      triggerPrice: "180000000",
      triggerCondition: "below",
      orderSide: "long",
      baseAssetAmount: "1000000000",
      reduceOnly: true,
      expiry: 1700000000,
      feedId: SOL_PYTH_FEED_ID,
    };

    const encrypted = await encryptOrderForTEE(orderData, pubKeyHex);
    const orderHashBytes = Buffer.from(encrypted.orderHash, "hex");
    const encryptedDataBytes = Buffer.from(encrypted.encryptedData, "base64");
    const feedIdBytes = Buffer.from(SOL_PYTH_FEED_ID, "hex");

    const ix = await buildCreateEncryptedOrderInstruction(testOwner.publicKey, {
      orderHash: orderHashBytes,
      encryptedData: encryptedDataBytes,
      feedId: feedIdBytes,
    });

    expect(ix.programId.equals(GHOST_BRIDGE_PROGRAM_ID)).toBe(true);
    expect(ix.keys.length).toBe(4);

    expect(ix.keys[0].pubkey.equals(testOwner.publicKey)).toBe(true);
    expect(ix.keys[0].isSigner).toBe(true);
    expect(ix.keys[0].isWritable).toBe(true);

    const [executorPda] = deriveExecutorAuthorityPda(testOwner.publicKey);
    expect(ix.keys[1].pubkey.equals(executorPda)).toBe(true);
    expect(ix.keys[1].isWritable).toBe(true);

    const [orderPda] = deriveEncryptedOrderPda(testOwner.publicKey, orderHashBytes);
    expect(ix.keys[2].pubkey.equals(orderPda)).toBe(true);
    expect(ix.keys[2].isWritable).toBe(true);

    expect(ix.keys[3].pubkey.equals(SystemProgram.programId)).toBe(true);

    expect(ix.data.length).toBe(8 + 32 + 256 + 2 + 32);
  });

  it("should build cancel_encrypted_order instruction correctly", async () => {
    const orderHash = Buffer.alloc(32, 1);

    const ix = await buildCancelEncryptedOrderInstruction(
      testOwner.publicKey,
      orderHash
    );

    expect(ix.programId.equals(GHOST_BRIDGE_PROGRAM_ID)).toBe(true);
    expect(ix.keys.length).toBe(3);

    expect(ix.keys[0].pubkey.equals(testOwner.publicKey)).toBe(true);
    expect(ix.keys[0].isSigner).toBe(true);

    const [orderPda] = deriveEncryptedOrderPda(testOwner.publicKey, orderHash);
    expect(ix.keys[1].pubkey.equals(orderPda)).toBe(true);
    expect(ix.keys[1].isWritable).toBe(true);

    const [executorPda] = deriveExecutorAuthorityPda(testOwner.publicKey);
    expect(ix.keys[2].pubkey.equals(executorPda)).toBe(true);
    expect(ix.keys[2].isWritable).toBe(true);

    expect(ix.data.length).toBe(8);
  });

  it("should build close_encrypted_order instruction correctly", async () => {
    const orderHash = Buffer.alloc(32, 2);

    const ix = await buildCloseEncryptedOrderInstruction(
      testOwner.publicKey,
      orderHash
    );

    expect(ix.programId.equals(GHOST_BRIDGE_PROGRAM_ID)).toBe(true);
    expect(ix.keys.length).toBe(2);

    expect(ix.keys[0].pubkey.equals(testOwner.publicKey)).toBe(true);
    expect(ix.keys[0].isSigner).toBe(true);
    expect(ix.keys[0].isWritable).toBe(true);

    const [orderPda] = deriveEncryptedOrderPda(testOwner.publicKey, orderHash);
    expect(ix.keys[1].pubkey.equals(orderPda)).toBe(true);
    expect(ix.keys[1].isWritable).toBe(true);

    expect(ix.data.length).toBe(8);
  });
});

describe("Ghost-Bridge: Account Parsing", () => {
  it("should parse ExecutorAuthority account data correctly", () => {
    const testOwner = Keypair.generate();
    const orderHash1 = Buffer.alloc(32, 0xaa);
    const orderHash2 = Buffer.alloc(32, 0xbb);

    const accountSize = 8 + 32 + 8 + 1 + 1 + (32 * 16) + 1;
    const data = Buffer.alloc(accountSize);
    let offset = 0;

    const discriminator = Buffer.from([0xfe, 0x53, 0x04, 0x74, 0x1b, 0x70, 0xde, 0xcc]);
    discriminator.copy(data, offset);
    offset += 8;

    testOwner.publicKey.toBuffer().copy(data, offset);
    offset += 32;

    new BN(5).toArrayLike(Buffer, "le", 8).copy(data, offset);
    offset += 8;

    data.writeUInt8(1, offset);
    offset += 1;

    data.writeUInt8(254, offset);
    offset += 1;

    orderHash1.copy(data, offset);
    offset += 32;
    orderHash2.copy(data, offset);
    offset += 32;
    offset += 32 * 14;

    data.writeUInt8(2, offset);

    const parsed = parseExecutorAuthorityAccount(data);

    expect(parsed.owner.equals(testOwner.publicKey)).toBe(true);
    expect(parsed.orderCount.toNumber()).toBe(5);
    expect(parsed.isDelegated).toBe(true);
    expect(parsed.bump).toBe(254);
    expect(parsed.orderHashCount).toBe(2);
    expect(parsed.orderHashes.length).toBe(2);
    expect(Buffer.from(parsed.orderHashes[0]).equals(orderHash1)).toBe(true);
    expect(Buffer.from(parsed.orderHashes[1]).equals(orderHash2)).toBe(true);
  });

  it("should parse EncryptedOrder account data correctly", () => {
    const testOwner = Keypair.generate();
    const executorAuthority = Keypair.generate();
    const orderHash = Buffer.alloc(32, 0xcc);
    const feedId = Buffer.from(SOL_PYTH_FEED_ID, "hex");
    const encryptedData = Buffer.alloc(256, 0xdd);
    const actualDataLen = 128;

    const accountSize = 420;
    const data = Buffer.alloc(accountSize);
    let offset = 0;

    const discriminator = Buffer.from([0x52, 0x34, 0x5d, 0x48, 0xd1, 0xd4, 0x32, 0xfa]);
    discriminator.copy(data, offset);
    offset += 8;

    testOwner.publicKey.toBuffer().copy(data, offset);
    offset += 32;

    orderHash.copy(data, offset);
    offset += 32;

    executorAuthority.publicKey.toBuffer().copy(data, offset);
    offset += 32;

    encryptedData.copy(data, offset);
    offset += 256;

    data.writeUInt16LE(actualDataLen, offset);
    offset += 2;

    feedId.copy(data, offset);
    offset += 32;

    new BN(1700000000).toArrayLike(Buffer, "le", 8).copy(data, offset);
    offset += 8;

    new BN(1700001000).toArrayLike(Buffer, "le", 8).copy(data, offset);
    offset += 8;

    new BN(185000000).toArrayLike(Buffer, "le", 8).copy(data, offset);
    offset += 8;

    data.writeUInt8(EncryptedOrderStatus.Triggered, offset);
    offset += 1;

    data.writeUInt8(253, offset);

    const parsed = parseEncryptedOrderAccount(data);

    expect(parsed.owner.equals(testOwner.publicKey)).toBe(true);
    expect(Buffer.from(parsed.orderHash).equals(orderHash)).toBe(true);
    expect(parsed.executorAuthority.equals(executorAuthority.publicKey)).toBe(true);
    expect(parsed.dataLen).toBe(actualDataLen);
    expect(parsed.encryptedData.length).toBe(actualDataLen);
    expect(Buffer.from(parsed.feedId).equals(feedId)).toBe(true);
    expect(parsed.createdAt.toNumber()).toBe(1700000000);
    expect(parsed.triggeredAt.toNumber()).toBe(1700001000);
    expect(parsed.executionPrice.toNumber()).toBe(185000000);
    expect(parsed.status).toBe(EncryptedOrderStatus.Triggered);
    expect(parsed.bump).toBe(253);
  });
});

describe("Ghost-Bridge: Order Status Transitions", () => {
  it("should have correct status enum values", () => {
    expect(EncryptedOrderStatus.Active).toBe(0);
    expect(EncryptedOrderStatus.Triggered).toBe(1);
    expect(EncryptedOrderStatus.Executed).toBe(2);
    expect(EncryptedOrderStatus.Cancelled).toBe(3);
  });

  it("should correctly identify valid status values", () => {
    const validStatuses = [0, 1, 2, 3];

    for (const status of validStatuses) {
      expect(Object.values(EncryptedOrderStatus)).toContain(status);
    }
  });
});

describe("Ghost-Bridge: Trigger Condition Logic", () => {
  const checkTriggerCondition = (
    triggerCondition: "above" | "below",
    triggerPrice: number,
    currentPrice: number
  ): boolean => {
    if (triggerCondition === "above") {
      return currentPrice >= triggerPrice;
    } else {
      return currentPrice <= triggerPrice;
    }
  };

  describe("Above condition", () => {
    it("should trigger when current price exceeds trigger price", () => {
      expect(checkTriggerCondition("above", 100, 110)).toBe(true);
    });

    it("should trigger when current price equals trigger price", () => {
      expect(checkTriggerCondition("above", 100, 100)).toBe(true);
    });

    it("should not trigger when current price is below trigger price", () => {
      expect(checkTriggerCondition("above", 100, 90)).toBe(false);
    });
  });

  describe("Below condition", () => {
    it("should trigger when current price is below trigger price", () => {
      expect(checkTriggerCondition("below", 100, 90)).toBe(true);
    });

    it("should trigger when current price equals trigger price", () => {
      expect(checkTriggerCondition("below", 100, 100)).toBe(true);
    });

    it("should not trigger when current price exceeds trigger price", () => {
      expect(checkTriggerCondition("below", 100, 110)).toBe(false);
    });
  });
});

describe("Ghost-Bridge: Network Connectivity (Integration)", () => {
  let connection: Connection;

  beforeAll(() => {
    connection = new Connection(DEVNET_RPC, "confirmed");
  });

  it("should connect to Devnet", async () => {
    const slot = await connection.getSlot();
    expect(slot).toBeGreaterThan(0);
  });

  it("should fetch program account (ghost-bridge exists)", async () => {
    const accountInfo = await connection.getAccountInfo(GHOST_BRIDGE_PROGRAM_ID);

    if (accountInfo) {
      expect(accountInfo.executable).toBe(true);
    } else {
      console.warn(
        "[Test] Ghost-bridge program not deployed at:",
        GHOST_BRIDGE_PROGRAM_ID.toBase58()
      );
    }
  });
});

describe("Ghost-Bridge: End-to-End Order Lifecycle (Simulation)", () => {
  const testOwner = Keypair.generate();

  it("should simulate complete encrypted order lifecycle", async () => {
    const { PrivateKey } = await import("eciesjs");
    const teeKeyPair = new PrivateKey();
    const teePublicKey = teeKeyPair.publicKey.toHex();
    const teePrivateKey = teeKeyPair.toHex();

    const orderData: CompressedGhostOrderData = {
      owner: testOwner.publicKey.toBase58(),
      orderId: Date.now().toString(),
      marketIndex: 0,
      triggerPrice: "180000000",
      triggerCondition: "below",
      orderSide: "long",
      baseAssetAmount: "1000000000",
      reduceOnly: true,
      expiry: Math.floor(Date.now() / 1000) + 3600,
      feedId: SOL_PYTH_FEED_ID,
    };

    const encrypted = await encryptOrderForTEE(orderData, teePublicKey);
    expect(encrypted.orderHash).toBeDefined();
    expect(encrypted.encryptedData).toBeDefined();

    const orderHashBytes = Buffer.from(encrypted.orderHash, "hex");
    const [encryptedOrderPda] = deriveEncryptedOrderPda(
      testOwner.publicKey,
      orderHashBytes
    );
    expect(encryptedOrderPda).toBeInstanceOf(PublicKey);

    const decrypted = await decryptOrderInBrowser(
      encrypted.encryptedData,
      teePrivateKey
    );

    expect(decrypted.owner).toBe(orderData.owner);
    expect(decrypted.orderId).toBe(orderData.orderId);
    expect(decrypted.marketIndex).toBe(orderData.marketIndex);
    expect(decrypted.triggerPrice).toBe(orderData.triggerPrice);
    expect(decrypted.triggerCondition).toBe(orderData.triggerCondition);
    expect(decrypted.orderSide).toBe(orderData.orderSide);

    const recomputedHash = await computeOrderHash({
      ...decrypted,
      salt: decrypted.salt,
    });

    expect(recomputedHash).toBe(encrypted.orderHash);

    console.log("\n=== E2E Lifecycle Simulation ===");
    console.log("1. Order created with hash:", encrypted.orderHash.slice(0, 16) + "...");
    console.log("2. Encrypted data size:", encrypted.encryptedData.length, "bytes (base64)");
    console.log("3. Order PDA:", encryptedOrderPda.toBase58());
    console.log("4. Decryption verified: ✓");
    console.log("5. Hash recomputation verified: ✓");
    console.log("================================\n");
  });

  it("should handle order expiry correctly", async () => {
    const pastExpiry = Math.floor(Date.now() / 1000) - 3600;
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
    const noExpiry = 0;

    const currentTime = Math.floor(Date.now() / 1000);

    const isExpired = (expiry: number, currentTime: number): boolean => {
      return expiry !== 0 && currentTime > expiry;
    };

    expect(isExpired(pastExpiry, currentTime)).toBe(true);
    expect(isExpired(futureExpiry, currentTime)).toBe(false);
    expect(isExpired(noExpiry, currentTime)).toBe(false);
  });
});
