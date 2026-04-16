import { createConfig } from "@account-kit/react";
import { alchemy, sepolia } from "@account-kit/infra";
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient();

export const accountKitConfig = createConfig(
  {
    transport: alchemy({
      apiKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY,
    }),
    chain: sepolia,
    enablePopupOauth: true,
  },
  {
    auth: {
      sections: [
        [
          { type: "passkey" },
          { type: "social", authProviderId: "google", mode: "popup" },
        ],
        [{ type: "external_wallets", walletConnect: false }],
      ],
      addPasskeyOnSignup: false,
    },
  }
);
