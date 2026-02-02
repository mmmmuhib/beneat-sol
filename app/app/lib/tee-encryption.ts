import { Buffer } from "buffer";
import { PublicKey } from "@solana/web3.js";

export interface CompressedGhostOrderData {
  owner: string;
  orderId: string;
  marketIndex: number;
  triggerPrice: string;
  triggerCondition: "above" | "below";
  orderSide: "long" | "short";
  baseAssetAmount: string;
  reduceOnly: boolean;
  expiry: number;
  feedId: string;
  salt?: string;
}

export interface EncryptedOrderPayload {
  encryptedData: string;
  orderHash: string;
  version: number;
}

let eciesModule: typeof import("eciesjs") | null = null;
let eciesConfigured = false;

async function getEciesModule() {
  if (!eciesModule) {
    eciesModule = await import("eciesjs");
  }
  if (!eciesConfigured && eciesModule.ECIES_CONFIG) {
    eciesModule.ECIES_CONFIG.ellipticCurve = "x25519";
    eciesConfigured = true;
  }
  return eciesModule;
}

export function generateOrderSalt(): string {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return Buffer.from(salt).toString("hex");
}

export async function encryptOrderForTEE(
  orderData: CompressedGhostOrderData,
  teePublicKey: string
): Promise<EncryptedOrderPayload> {
  const ecies = await getEciesModule();

  const orderWithSalt: CompressedGhostOrderData = {
    ...orderData,
    salt: orderData.salt || generateOrderSalt(),
  };

  const message = new TextEncoder().encode(JSON.stringify(orderWithSalt));
  const publicKeyBuffer = Buffer.from(teePublicKey, "hex");

  const encrypted = ecies.encrypt(publicKeyBuffer, Buffer.from(message));

  const orderHash = await computeOrderHash(orderWithSalt);

  return {
    encryptedData: encrypted.toString("base64"),
    orderHash,
    version: 1,
  };
}

export async function computeOrderHash(
  orderData: CompressedGhostOrderData
): Promise<string> {
  const data = new Uint8Array(144);
  let offset = 0;

  const ownerBytes = new PublicKey(orderData.owner).toBytes();
  data.set(ownerBytes, offset);
  offset += 32;

  const orderIdBuffer = new ArrayBuffer(8);
  const orderIdView = new DataView(orderIdBuffer);
  orderIdView.setBigUint64(0, BigInt(orderData.orderId), true);
  data.set(new Uint8Array(orderIdBuffer), offset);
  offset += 8;

  const marketIndexBuffer = new ArrayBuffer(2);
  const marketIndexView = new DataView(marketIndexBuffer);
  marketIndexView.setUint16(0, orderData.marketIndex, true);
  data.set(new Uint8Array(marketIndexBuffer), offset);
  offset += 2;

  const triggerPriceBuffer = new ArrayBuffer(8);
  const triggerPriceView = new DataView(triggerPriceBuffer);
  triggerPriceView.setBigInt64(0, BigInt(orderData.triggerPrice), true);
  data.set(new Uint8Array(triggerPriceBuffer), offset);
  offset += 8;

  data[offset++] = orderData.triggerCondition === "above" ? 0 : 1;
  data[offset++] = orderData.orderSide === "long" ? 0 : 1;

  const baseAmountBuffer = new ArrayBuffer(8);
  const baseAmountView = new DataView(baseAmountBuffer);
  baseAmountView.setBigUint64(0, BigInt(orderData.baseAssetAmount), true);
  data.set(new Uint8Array(baseAmountBuffer), offset);
  offset += 8;

  data[offset++] = orderData.reduceOnly ? 1 : 0;

  const expiryBuffer = new ArrayBuffer(8);
  const expiryView = new DataView(expiryBuffer);
  expiryView.setBigInt64(0, BigInt(orderData.expiry), true);
  data.set(new Uint8Array(expiryBuffer), offset);
  offset += 8;

  const feedIdBytes = Buffer.from(orderData.feedId, "hex");
  data.set(feedIdBytes.slice(0, 32), offset);
  offset += 32;

  const saltBytes = orderData.salt
    ? Buffer.from(orderData.salt, "hex")
    : new Uint8Array(16);
  data.set(saltBytes.slice(0, 16), offset);
  offset += 16;

  const { blake3 } = await import("@noble/hashes/blake3");
  const hash = blake3(data.slice(0, offset));

  return Buffer.from(hash).toString("hex");
}

export function validateTeePublicKey(publicKey: string): boolean {
  try {
    const buffer = Buffer.from(publicKey, "hex");
    return buffer.length === 32;
  } catch {
    return false;
  }
}

export async function deriveX25519PublicKey(
  privateKeyHex: string
): Promise<string> {
  const ecies = await getEciesModule();
  const sk = new ecies.PrivateKey(Buffer.from(privateKeyHex, "hex"));
  return sk.publicKey.toHex();
}

export async function decryptOrderInBrowser(
  encryptedData: string,
  privateKey: string
): Promise<CompressedGhostOrderData> {
  const ecies = await getEciesModule();

  const ciphertext = Buffer.from(encryptedData, "base64");
  const privateKeyBuffer = Buffer.from(privateKey, "hex");

  const plaintext = ecies.decrypt(privateKeyBuffer, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}

export interface OrderHashComponents {
  owner: Uint8Array;
  orderId: bigint;
  marketIndex: number;
  triggerPrice: bigint;
  triggerCondition: number;
  orderSide: number;
  baseAssetAmount: bigint;
  reduceOnly: boolean;
  expiry: bigint;
  feedId: Uint8Array;
  salt: Uint8Array;
}

export function orderDataToHashComponents(
  data: CompressedGhostOrderData
): OrderHashComponents {
  return {
    owner: new PublicKey(data.owner).toBytes(),
    orderId: BigInt(data.orderId),
    marketIndex: data.marketIndex,
    triggerPrice: BigInt(data.triggerPrice),
    triggerCondition: data.triggerCondition === "above" ? 0 : 1,
    orderSide: data.orderSide === "long" ? 0 : 1,
    baseAssetAmount: BigInt(data.baseAssetAmount),
    reduceOnly: data.reduceOnly,
    expiry: BigInt(data.expiry),
    feedId: Buffer.from(data.feedId, "hex"),
    salt: data.salt ? Buffer.from(data.salt, "hex") : new Uint8Array(16),
  };
}
