"use client";

import { useState } from "react";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { hardhat } from "wagmi/chains";
import { greenCommuteTokenAbi } from "../lib/greenCommuteTokenAbi";

const API =
  process.env.NEXT_PUBLIC_GREEN_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:4100";

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();

  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`API did not return JSON (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const msg = json?.details
      ? `${json.error || "Request failed"} | ${
          typeof json.details === "string" ? json.details : JSON.stringify(json.details)
        }`
      : json?.error || "Request failed";
    throw new Error(msg);
  }

  return json;
}

export default function ClaimOnChainButton({ claim, onDone }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: hardhat.id });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function run() {
    if (!claim?.id) return;
    if (!isConnected || !address) {
      setError("Connect wallet first.");
      return;
    }
    if (!walletClient || !publicClient) {
      setError("Wallet or public client is not ready.");
      return;
    }

    setBusy(true);
    setError("");
    setInfo("");

    try {
      const payload = await fetchJson(`${API}/api/claims/${claim.id}/sign`, {
        method: "POST",
      });

      const walletFromClaim = String(payload.walletAddress || "").toLowerCase();
      if (walletFromClaim !== String(address).toLowerCase()) {
        throw new Error("Connected wallet does not match claim wallet.");
      }

      const targetChainId = Number(payload.chainId);
      if (chainId !== targetChainId) {
        await switchChainAsync({ chainId: targetChainId });
      }

      const txHash = await walletClient.writeContract({
        account: walletClient.account,
        address: payload.contractAddress,
        abi: greenCommuteTokenAbi,
        functionName: "claimReward",
        args: [
          payload.walletAddress,
          BigInt(payload.amount),
          BigInt(payload.nonce),
          BigInt(payload.expiry),
          payload.signature,
        ],
        chain: hardhat,
      });

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 1,
      });

      if (receipt.status !== "success") {
        throw new Error("Transaction reverted.");
      }

      try {
        await fetchJson(`${API}/api/claims/${claim.id}/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ txHash }),
        });
      } catch (confirmError) {
        throw new Error(
          `On-chain claim tx succeeded, but backend confirmation failed. txHash=${txHash} | ${String(
            confirmError?.message || confirmError
          )}`
        );
      }

      setInfo("On-chain claim confirmed.");
      if (typeof onDone === "function") {
        await onDone({ txHash, claimId: claim.id });
      }
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <button onClick={run} disabled={busy} style={smallBtn(busy ? 0.65 : 1)}>
        {busy ? "Claiming..." : "Claim on-chain"}
      </button>
      {error ? <div className="small" style={{ color: "#fca5a5" }}>{error}</div> : null}
      {info ? <div className="small" style={{ color: "#86efac" }}>{info}</div> : null}
    </div>
  );
}

function smallBtn(opacity = 1) {
  return {
    background: "rgba(255,255,255,.08)",
    color: "rgba(255,255,255,.92)",
    border: "1px solid rgba(255,255,255,.14)",
    padding: "8px 10px",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 900,
    opacity,
  };
}
