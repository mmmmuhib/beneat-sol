import { PublicKey } from "@solana/web3.js";

export const MAGIC_PROGRAM_ID = new PublicKey(
  "Magic11111111111111111111111111111111111111"
);

export const MAGIC_CONTEXT_ID = new PublicKey(
  "MagicContext1111111111111111111111111111111"
);

export const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);

export const MAGICBLOCK_DEVNET_RPC = "https://devnet.magicblock.app";
export const MAGICBLOCK_DEVNET_WS = "wss://devnet.magicblock.app";

export const SESSION_KEYS_PROGRAM_ID = new PublicKey(
  "KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5"
);

export const GHOST_BRIDGE_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_GHOST_BRIDGE_PROGRAM_ID ||
    "8w95bQ7UzKHKa4NYvyVeAVGN3dMgwshJhhTinPfabMLA"
);

export const DRIFT_PROGRAM_ID = new PublicKey(
  "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH"
);
