"use client";

import { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RainbowKitProvider,
  getDefaultConfig,
  lightTheme,
} from "@rainbow-me/rainbowkit";
import { http } from "viem";
import { activeChain } from "@/lib/chain";
import "@rainbow-me/rainbowkit/styles.css";

const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_ID || "demo";

const config = getDefaultConfig({
  appName: "Tanda",
  projectId,
  chains: [activeChain],
  transports: {
    [activeChain.id]: http(
      activeChain.rpcUrls.default.http[0]
    ),
  },
  ssr: true,
});

const queryClient = new QueryClient();

const rktTheme = lightTheme({
  accentColor: "#D97706",
  accentColorForeground: "#1C1410",
  borderRadius: "small",
  fontStack: "system",
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rktTheme}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
