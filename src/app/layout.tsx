import type { Metadata } from "next";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";
import { getConfig } from "@/lib/wagmi";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "FelloPilot — AI crypto execution autopilot",
  description:
    "Natural-language crypto intent → onchain action flow on Sepolia testnet. Honest, auditable, simulated when needed.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const cookie = headersList.get("cookie") ?? "";
  const initialState = cookieToInitialState(getConfig(), cookie);
  return (
    <html lang="ko">
      <body>
        <Providers initialState={initialState}>{children}</Providers>
      </body>
    </html>
  );
}
