"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { useAuthModal, useLogout, useSmartAccountClient, useUser } from "@account-kit/react";

const POLICY_ID = process.env.NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID;
const AA_ENABLED = ["1", "true", "yes"].includes(
  String(process.env.NEXT_PUBLIC_AA_ENABLED || "").toLowerCase()
);

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
  const authModal = AA_ENABLED ? useAuthModal() : { openAuthModal: () => {} };
  const logoutApi = AA_ENABLED ? useLogout() : { logout: () => Promise.resolve() };
  const user = AA_ENABLED ? useUser() : null;
  const { client: smartAccountClient, isLoadingClient } = AA_ENABLED
    ? useSmartAccountClient({
        type: "LightAccount",
        policyId: POLICY_ID || undefined,
      })
    : { client: null, isLoadingClient: false };

  // Don't return wallet state until client-side hydration is complete
  if (!mounted) {
    return {
      address: undefined,
      isConnected: false,
      isEmbedded: false,
      smartClient: null,
      smartAddress: null,
      isLoadingWallet: true,
      embeddedEmail: null,
      openEmbeddedAuthModal: () => {},
      logoutEmbedded: async () => {},
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
      embeddedEmail: null,
      openEmbeddedAuthModal: authModal.openAuthModal,
      logoutEmbedded: logoutApi.logout,
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
      embeddedEmail: user.email ?? null,
      openEmbeddedAuthModal: authModal.openAuthModal,
      logoutEmbedded: logoutApi.logout,
    };
  }

  return {
    address: undefined,
    isConnected: false,
    isEmbedded: false,
    smartClient: null,
    smartAddress: null,
    embeddedEmail: null,
    openEmbeddedAuthModal: authModal.openAuthModal,
    logoutEmbedded: logoutApi.logout,
  };
}
