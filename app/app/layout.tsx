import "./globals.css";
import { Outfit, Oxygen_Mono } from "next/font/google";
import { SolanaProviderWrapper } from "./components/solana-provider";
import { NavWrapper } from "./components/nav-wrapper";
import { PriceStreamProvider } from "./components/price-stream-provider";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const oxygenMono = Oxygen_Mono({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-oxygen-mono",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${outfit.variable} ${oxygenMono.variable}`}>
      <body>
        <SolanaProviderWrapper>
          <PriceStreamProvider>
            <NavWrapper />
            {children}
          </PriceStreamProvider>
        </SolanaProviderWrapper>
      </body>
    </html>
  );
}
