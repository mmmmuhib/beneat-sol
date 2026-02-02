"use client";

import { PropsWithChildren } from "react";
import { PriceStreamProvider } from "./price-stream-provider";

export function Providers({ children }: PropsWithChildren) {
  return <PriceStreamProvider>{children}</PriceStreamProvider>;
}
