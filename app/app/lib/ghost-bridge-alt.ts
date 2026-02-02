import {
  AddressLookupTableProgram,
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  AddressLookupTableAccount,
} from "@solana/web3.js";
import {
  GHOST_BRIDGE_PROGRAM_ID,
  DRIFT_PROGRAM_ID,
  MAGIC_CONTEXT_ID,
  MAGIC_PROGRAM_ID,
  DELEGATION_PROGRAM_ID,
} from "./magicblock-constants";

export interface GhostBridgeAltConfig {
  ghostBridgeProgram: PublicKey;
  driftProgram: PublicKey;
  driftState: PublicKey;
  magicContext: PublicKey;
  magicProgram: PublicKey;
  delegationProgram: PublicKey;
}

export const DEFAULT_ALT_CONFIG: GhostBridgeAltConfig = {
  ghostBridgeProgram: GHOST_BRIDGE_PROGRAM_ID,
  driftProgram: DRIFT_PROGRAM_ID,
  driftState: new PublicKey("8VpRhuxa7sUUepdY3kQiTmX9rS5vx4WgaXiAnXq4KCtr"),
  magicContext: MAGIC_CONTEXT_ID,
  magicProgram: MAGIC_PROGRAM_ID,
  delegationProgram: DELEGATION_PROGRAM_ID,
};

export async function createGhostBridgeAlt(
  connection: Connection,
  payer: PublicKey,
  config: GhostBridgeAltConfig = DEFAULT_ALT_CONFIG,
  additionalAddresses: PublicKey[] = []
): Promise<{
  createInstruction: TransactionInstruction;
  extendInstruction: TransactionInstruction;
  altAddress: PublicKey;
}> {
  const slot = await connection.getSlot();

  const [createInstruction, altAddress] =
    AddressLookupTableProgram.createLookupTable({
      authority: payer,
      payer: payer,
      recentSlot: slot,
    });

  const addresses = [
    config.ghostBridgeProgram,
    config.driftProgram,
    config.driftState,
    config.magicContext,
    config.magicProgram,
    config.delegationProgram,
    ...additionalAddresses,
  ];

  const extendInstruction = AddressLookupTableProgram.extendLookupTable({
    payer: payer,
    authority: payer,
    lookupTable: altAddress,
    addresses,
  });

  return {
    createInstruction,
    extendInstruction,
    altAddress,
  };
}

export async function fetchAltAccount(
  connection: Connection,
  altAddress: PublicKey
): Promise<AddressLookupTableAccount | null> {
  const accountInfo = await connection.getAccountInfo(altAddress);

  if (!accountInfo) {
    return null;
  }

  return new AddressLookupTableAccount({
    key: altAddress,
    state: AddressLookupTableAccount.deserialize(accountInfo.data),
  });
}

export async function extendAlt(
  connection: Connection,
  payer: PublicKey,
  altAddress: PublicKey,
  newAddresses: PublicKey[]
): Promise<TransactionInstruction> {
  return AddressLookupTableProgram.extendLookupTable({
    payer: payer,
    authority: payer,
    lookupTable: altAddress,
    addresses: newAddresses,
  });
}

export async function buildVersionedTransaction(
  connection: Connection,
  payer: PublicKey,
  instructions: TransactionInstruction[],
  altAccounts: AddressLookupTableAccount[]
): Promise<VersionedTransaction> {
  const blockhash = await connection.getLatestBlockhash();

  const messageV0 = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash.blockhash,
    instructions,
  }).compileToV0Message(altAccounts);

  return new VersionedTransaction(messageV0);
}

export async function getOrCreateGhostBridgeAlt(
  connection: Connection,
  payer: PublicKey,
  storedAltAddress?: string
): Promise<{
  altAccount: AddressLookupTableAccount;
  needsCreation: boolean;
  createInstructions?: TransactionInstruction[];
}> {
  if (storedAltAddress) {
    const altAddress = new PublicKey(storedAltAddress);
    const altAccount = await fetchAltAccount(connection, altAddress);

    if (altAccount) {
      return {
        altAccount,
        needsCreation: false,
      };
    }
  }

  const { createInstruction, extendInstruction, altAddress } =
    await createGhostBridgeAlt(connection, payer);

  const placeholderAlt = new AddressLookupTableAccount({
    key: altAddress,
    state: {
      deactivationSlot: BigInt("18446744073709551615"),
      lastExtendedSlot: 0,
      lastExtendedSlotStartIndex: 0,
      authority: payer,
      addresses: [],
    },
  });

  return {
    altAccount: placeholderAlt,
    needsCreation: true,
    createInstructions: [createInstruction, extendInstruction],
  };
}

export function estimateTransactionSize(
  instructions: TransactionInstruction[],
  numSigners: number = 1,
  useAlt: boolean = false
): number {
  let size = 0;

  size += 1 + 64 * numSigners;
  size += 32;
  size += 32;

  for (const ix of instructions) {
    size += 1;
    size += 1 + ix.keys.length * (useAlt ? 1 : 33);
    size += 2 + ix.data.length;
  }

  return size;
}

export function shouldUseAlt(instructions: TransactionInstruction[]): boolean {
  const sizeWithoutAlt = estimateTransactionSize(instructions, 1, false);
  return sizeWithoutAlt > 1100;
}
