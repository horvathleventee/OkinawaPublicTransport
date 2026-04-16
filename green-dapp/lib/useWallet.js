"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { useUser, useSmartAccountClient } from "@account-kit/react";

const POLICY_ID = process.env.NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID;

/**
 * Unified wallet hook — works for both:
 *  - injected wallets (MetaMask etc.) via wagmi
 *  - Account Kit embedded wallets (email / passkey / social) via @account-kit/react
 *
 * Returns { address, isConnected, isEmbedded, smartClient, smartAddress }
 * For embedded wallets, address = smart account address (gasless LightAccount)
 */
export function useWallet() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const wagmi = useAccount();
  const user = useUser();

  // Always call hook unconditionally (React rules)
  const { client: smartAccountClient, isLoadingClient } = useSmartAccountClient({
    type: "LightAccount",
    policyId: POLICY_ID || undefined,
  });

  // Don't return wallet state until client-side hydration is complete
  if (!mounted) {
    return {
      address: undefined,
      isConnected: false,
      isEmbedded: false,
      smartClient: null,
      smartAddress: null,
      isLoadingWallet: true,
    };
  }

  // Injected wallet takes priority
  if (wagmi.isConnected && wagmi.address) {
    return {
      address: wagmi.address,
      isConnected: true,
      isEmbedded: false,
      smartClient: null,
      smartAddress: null,
    };
  }

  // Account Kit embedded wallet — wait for smart account to initialise
  if (user) {
    const smartAddress = smartAccountClient?.account?.address ?? null;
    return {
      address: smartAddress ?? null,   // null while loading → components wait
      signerAddress: user.address,
      isConnected: !!smartAddress,
      isEmbedded: true,
      smartClient: smartAccountClient ?? null,
      smartAddress,
      isLoadingWallet: isLoadingClient || !smartAddress,
    };
  }

  return {
    address: undefined,
    isConnected: false,
    isEmbedded: false,
    smartClient: null,
    smartAddress: null,
  };
}
