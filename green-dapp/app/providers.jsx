"use client";

import { WagmiProvider } from "wagmi";
import { AlchemyAccountProvider } from "@account-kit/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { accountKitConfig, queryClient } from "../lib/accountKitConfig";
import { wagmiConfig } from "../lib/wagmiConfig";

export default function Providers({ children }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AlchemyAccountProvider config={accountKitConfig} queryClient={queryClient}>
          {children}
        </AlchemyAccountProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
