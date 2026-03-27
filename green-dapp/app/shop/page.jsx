"use client";

import { useEffect, useMemo, useState } from "react";
import { parseUnits } from "viem";
import { hardhat } from "wagmi/chains";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { addOwned, isOwned, loadInventory, saveInventory } from "../lib/inventory";
import {
  AVATAR_SHOP_SLOTS,
  AVATAR_SLOT_HINTS,
  AVATAR_SLOT_LABELS,
  createEmptySlotMap,
} from "../lib/avatarConfig";
import { getItemRarity, getItemTheme } from "../lib/api";
import Nav from "../components/Nav";
import { greenCommuteTokenAbi } from "../../lib/greenCommuteTokenAbi";

const API =
  process.env.NEXT_PUBLIC_GREEN_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:4100";

function groupBySlot(items) {
  const map = createEmptySlotMap();
  for (const it of items) {
    (map[it.slot] || (map[it.slot] = [])).push(it);
  }
  return map;
}

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
      ? `${json.error || "Request failed"} | ${typeof json.details === "string" ? json.details : JSON.stringify(json.details)}`
      : json?.error || "Request failed";
    throw new Error(msg);
  }

  return json;
}

export default function ShopPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: hardhat.id });

  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState([]);
  const [inv, setInv] = useState(null);
  const [rewards, setRewards] = useState(null);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");
  const addressKey = isConnected && address ? address.toLowerCase() : "guest";
  const activeCharacter = inv?.equipped?.character || "girl";

  useEffect(() => {
    setMounted(true);
  }, []);

  async function loadItems() {
    const res = await fetch("/items/items.json", { cache: "no-store" });
    const json = await res.json();
    setItems(Array.isArray(json) ? json : []);
  }

  async function loadRewards(addr) {
    const json = await fetchJson(`${API}/api/users/${addr}/rewards`, { cache: "no-store" });
    setRewards(json);
  }

  async function syncInventoryFromApi(addr) {
    const json = await fetchJson(`${API}/api/users/${addr}/inventory`, { cache: "no-store" });

    const local = loadInventory(addressKey);
    const merged = structuredClone(local);
    merged.owned = Array.isArray(merged.owned) ? merged.owned : [];

    for (const itemId of json.ownedItemIds || []) {
      if (!merged.owned.includes(itemId)) {
        merged.owned.push(itemId);
      }
    }

    saveInventory(addressKey, merged);
    setInv(merged);
  }

  useEffect(() => {
    loadItems().catch((e) => {
      console.error("Failed to load items:", e);
      setErr(String(e?.message || e));
    });
  }, []);

  useEffect(() => {
    const loaded = loadInventory(addressKey);
    setInv(loaded);
    setSuccess("");
    setErr("");

    if (isConnected && address) {
      Promise.all([loadRewards(address), syncInventoryFromApi(address)]).catch((e) =>
        setErr(String(e?.message || e)),
      );
    } else {
      setRewards(null);
    }
  }, [isConnected, address, addressKey]);

  const available = rewards?.spendableTokensOnChain ?? rewards?.onChainBalanceTokens ?? null;
  const grouped = useMemo(() => groupBySlot(items), [items]);

  async function buy(item) {
    setErr("");
    setSuccess("");

    if (!inv) return;

    if (!isConnected || !address) {
      setErr("Please connect wallet to buy items.");
      return;
    }
    if (!walletClient || !publicClient) {
      setErr("Wallet is not ready.");
      return;
    }
    if (!rewards?.contractAddress || !rewards?.burnAddress) {
      setErr("Token configuration is not loaded.");
      return;
    }
    if (available == null) {
      setErr("Balance not loaded yet.");
      return;
    }
    if (Array.isArray(item.characters) && item.characters.length > 0 && !item.characters.includes(activeCharacter)) {
      setErr(`This item fits the ${item.characters.join(" / ")} avatar only.`);
      return;
    }
    if (item.price > available) {
      setErr(`Not enough on-chain GCT. Need ${item.price}, available ${available.toFixed(2)}.`);
      return;
    }
    if (isOwned(inv, item.id)) {
      setErr("You already own this item.");
      return;
    }

    try {
      const targetChainId = Number(rewards.chainId || hardhat.id);
      if (chainId !== targetChainId) {
        await switchChainAsync({ chainId: targetChainId });
      }

      const amountWei = parseUnits(String(item.price), Number(rewards.decimals || 18));
      const burnTxHash = await walletClient.writeContract({
        account: walletClient.account,
        address: rewards.contractAddress,
        abi: greenCommuteTokenAbi,
        functionName: "transfer",
        args: [rewards.burnAddress, amountWei],
        chain: hardhat,
      });

      const burnReceipt = await publicClient.waitForTransactionReceipt({
        hash: burnTxHash,
        confirmations: 1,
      });
      if (burnReceipt.status !== "success") {
        throw new Error("Burn transaction reverted.");
      }

      const result = await fetchJson(`${API}/api/shop/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          itemId: item.id,
          itemName: item.name,
          slotName: item.slot,
          priceTokens: Number(item.price || 0),
          metadata: {
            image: item.image || null,
            characters: item.characters || [],
            tags: item.tags || [],
          },
          txHash: burnTxHash,
          chainId: targetChainId,
        }),
      });

      const next = addOwned(structuredClone(inv), item.id);
      saveInventory(addressKey, next);
      setInv(next);
      await loadRewards(address);

      setSuccess(result?.alreadyOwned ? `Already owned: ${item.name}` : `Purchased: ${item.name}`);
    } catch (e) {
      console.error("buy failed:", e);
      setErr(String(e?.message || e));
    }
  }

  const walletLabel = mounted
    ? isConnected && address
      ? address
      : "Not connected (guest inventory)"
    : "Loading wallet...";

  return (
    <div className="shell">
      <Nav />
      <div className="topbar">
        <div className="title">
          <h1 className="h1">Shop</h1>
          <p className="subtitle">Buy cosmetics with your rewards. Purchases are stored in MySQL via API.</p>
        </div>
      </div>

      {err && <div className="error">Error: {err}</div>}
      {success && (
        <div
          style={{
            border: "1px solid rgba(52,211,153,.25)",
            background: "rgba(52,211,153,.08)",
            color: "rgba(255,255,255,.92)",
            borderRadius: 14,
            padding: "12px 14px",
            marginBottom: 14,
          }}
        >
          {success}
        </div>
      )}

      <div className="grid">
        <div className="card" style={{ gridColumn: "span 12" }}>
          <div className="accent green" />
          <div
            className="card-inner"
            style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
          >
            <div>
              <div className="card-title">Wallet</div>
              <div className="small">{walletLabel}</div>
              <div className="small" style={{ marginTop: 6 }}>
                Active avatar: <span className="mono">{activeCharacter}</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 14 }}>
              <div>
                <div className="card-title">On-chain spendable</div>
                <div className="metric-value" style={{ fontSize: 26 }}>
                  {mounted && isConnected ? available ?? "..." : "-"} <span className="metric-unit">GCT</span>
                </div>
              </div>

              <div>
                <div className="card-title">Owned</div>
                <div className="metric-value" style={{ fontSize: 26 }}>
                  {inv ? inv.owned.length : "..."} <span className="metric-unit">items</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {AVATAR_SHOP_SLOTS.map((slot) => (
          <div key={slot} className="card" style={{ gridColumn: "span 12" }}>
            <div className="accent cyan" />
            <div className="card-inner">
              <div className="section-title" style={{ textTransform: "capitalize" }}>
                {AVATAR_SLOT_LABELS[slot] || slot} <span className="hint">({AVATAR_SLOT_HINTS[slot] || "cosmetics"})</span>
              </div>

              <div className="shop-grid">
                {(grouped[slot] || []).map((it) => {
                  const owned = inv ? isOwned(inv, it.id) : false;
                  const characterLocked =
                    Array.isArray(it.characters) &&
                    it.characters.length > 0 &&
                    !it.characters.includes(activeCharacter);

                  return (
                    <div key={it.id} className="shop-item">
                      <div className="shop-img">
                        <img
                          src={it.image}
                          alt={it.name}
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div>
                          <div style={{ fontWeight: 900 }}>{it.name}</div>
                          <div className="small">
                            slot: <span className="mono">{it.slot}</span>
                          </div>
                          <div className="small">
                            {getItemRarity(it)} · {getItemTheme(it)}
                          </div>
                          {Array.isArray(it.characters) && it.characters.length > 0 ? (
                            <div className="small">
                              fit: <span className="mono">{it.characters.join(" / ")}</span>
                            </div>
                          ) : null}
                        </div>

                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 900 }}>{it.price} GCT</div>
                          <div className="small">
                            {characterLocked ? "needs other avatar" : owned ? "owned" : "not owned"}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => buy(it)}
                        disabled={!inv || owned || characterLocked}
                        style={{
                          marginTop: 12,
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,.14)",
                          background: owned || characterLocked ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.08)",
                          color: "rgba(255,255,255,.90)",
                          cursor: owned || characterLocked ? "not-allowed" : "pointer",
                          fontWeight: 900,
                        }}
                      >
                        {characterLocked ? `Switch to ${it.characters.join(" / ")}` : owned ? "Already owned" : "Buy"}
                      </button>

                      <div className="small" style={{ marginTop: 8, opacity: 0.8 }}>
                        Stored in DB via <span className="mono">shop_purchases</span>.
                      </div>
                    </div>
                  );
                })}
              </div>

              {(grouped[slot] || []).length === 0 ? (
                <div className="small" style={{ marginTop: 10 }}>
                  No assets are wired for this slot yet.
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
