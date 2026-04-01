"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { defineChain } from "viem";
import { injected } from "wagmi/connectors";

const queryClient = new QueryClient();
const localhost = defineChain({
  id: 31337,
  name: "Hardhat Localhost",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
    public: { http: ["http://127.0.0.1:8545"] },
  },
});

// Minimal config: injected (MetaMask) + default chains
const config = createConfig({
  chains: [localhost, sepolia, mainnet],
  connectors: [injected()],
  transports: {
    [localhost.id]: http("http://127.0.0.1:8545"),
    [sepolia.id]: http(), // uses public RPC; ok for demo UI
    [mainnet.id]: http(),
  },
});

export default function Providers({ children }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
