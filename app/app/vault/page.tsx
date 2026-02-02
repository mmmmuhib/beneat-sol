"use client";

import dynamic from "next/dynamic";

const VaultContent = dynamic(
  () => import("../components/vault-content").then((mod) => mod.VaultContent),
  { ssr: false }
);

export default function VaultPage() {
  return <VaultContent />;
}
