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
import { getCosmeticToken } from "../lib/cosmetics";
import Nav from "../components/Nav";
import { greenCommuteTokenAbi } from "../../lib/greenCommuteTokenAbi";
import { greenCommuteCosmeticsAbi } from "../../lib/greenCommuteCosmeticsAbi";

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

function formatTradeStatus(status) {
  const raw = String(status || "").trim().toLowerCase();
  if (!raw) return "Unknown";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function formatTradeDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("hu-HU", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

async function syncCosmetics(addr) {
  return fetchJson(`${API}/api/users/${addr}/cosmetics/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
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
  const [ownedOnChainIds, setOwnedOnChainIds] = useState([]);
  const [rewards, setRewards] = useState(null);
  const [activeTab, setActiveTab] = useState("shop");
  const [tradeHub, setTradeHub] = useState({
    openListings: [],
    myListings: [],
    incomingOffers: [],
    outgoingOffers: [],
    cosmeticsContractAddress: null,
    cosmeticsChainId: null,
    tradeOperatorAddress: null,
    tradeApprovalRequired: false,
    viewerTradeApproved: false,
  });
  const [listingItemId, setListingItemId] = useState("");
  const [listingNote, setListingNote] = useState("");
  const [tradeBusy, setTradeBusy] = useState("");
  const [offerSelections, setOfferSelections] = useState({});
  const [offerNotes, setOfferNotes] = useState({});
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
    setItems(
      Array.isArray(json)
        ? json.filter((item) => !Array.isArray(item?.tags) || !item.tags.includes("reward"))
        : []
    );
  }

  async function loadRewards(addr) {
    const json = await fetchJson(`${API}/api/users/${addr}/rewards`, { cache: "no-store" });
    setRewards(json);
  }

  async function syncInventoryFromApi(addr) {
    await syncCosmetics(addr).catch(() => null);
    const json = await fetchJson(`${API}/api/users/${addr}/inventory`, { cache: "no-store" });

    const local = loadInventory(addressKey);
    const merged = structuredClone(local);
    merged.owned = Array.isArray(json?.ownedItemIds) ? json.ownedItemIds : [];
    setOwnedOnChainIds(Array.isArray(json?.ownedItemIdsOnChain) ? json.ownedItemIdsOnChain : []);

    saveInventory(addressKey, merged);
    setInv(merged);
  }

  async function loadTradeHub(addr) {
    const query = addr ? `?wallet=${encodeURIComponent(addr)}` : "";
    const json = await fetchJson(`${API}/api/trades${query}`, { cache: "no-store" });
    setTradeHub({
      openListings: json?.openListings || [],
      myListings: json?.myListings || [],
      incomingOffers: json?.incomingOffers || [],
      outgoingOffers: json?.outgoingOffers || [],
      cosmeticsContractAddress: json?.cosmeticsContractAddress || null,
      cosmeticsChainId: json?.cosmeticsChainId || null,
      tradeOperatorAddress: json?.tradeOperatorAddress || null,
      tradeApprovalRequired: Boolean(json?.tradeApprovalRequired),
      viewerTradeApproved: Boolean(json?.viewerTradeApproved),
    });
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
      Promise.all([loadRewards(address), syncInventoryFromApi(address), loadTradeHub(address)]).catch((e) =>
        setErr(String(e?.message || e)),
      );
    } else {
      setRewards(null);
      setOwnedOnChainIds([]);
      setTradeHub({
        openListings: [],
        myListings: [],
        incomingOffers: [],
        outgoingOffers: [],
        cosmeticsContractAddress: null,
        cosmeticsChainId: null,
        tradeOperatorAddress: null,
        tradeApprovalRequired: false,
        viewerTradeApproved: false,
      });
    }
  }, [isConnected, address, addressKey]);

  const available = rewards?.spendableTokensOnChain ?? rewards?.onChainBalanceTokens ?? null;
  const grouped = useMemo(() => groupBySlot(items), [items]);
  const ownedOnChainItems = useMemo(() => {
    const ownedSet = new Set(ownedOnChainIds);
    return items.filter((item) => ownedSet.has(item.id));
  }, [items, ownedOnChainIds]);
  const activeMyListings = useMemo(
    () => tradeHub.myListings.filter((listing) => listing.status === "open"),
    [tradeHub.myListings]
  );
  const activeOutgoingOffers = useMemo(
    () => tradeHub.outgoingOffers.filter((offer) => offer.status === "pending"),
    [tradeHub.outgoingOffers]
  );
  const tradeHistory = useMemo(() => {
    const historyEntries = [];

    for (const listing of tradeHub.myListings) {
      if (listing.status !== "open") {
        historyEntries.push({
          id: `listing-${listing.id}`,
          kind: "listing",
          status: listing.status,
          updatedAt: listing.updatedAt || listing.createdAt || null,
          title: listing.item?.name || listing.itemId,
          subtitle: listing.note || "No listing note.",
          image: listing.item?.image || "",
        });
      }

      for (const offer of listing.offers || []) {
        if (offer.status !== "pending") {
          historyEntries.push({
            id: `incoming-${offer.id}`,
            kind: "incoming",
            status: offer.status,
            updatedAt: offer.updatedAt || offer.createdAt || listing.updatedAt || null,
            title: `${offer.offeredItem?.name || offer.offeredItemId} from ${offer.offerer?.customDisplayName || offer.offererWallet}`,
            subtitle: offer.note || "No note.",
            image: offer.offeredItem?.image || "",
          });
        }
      }
    }

    for (const offer of tradeHub.outgoingOffers) {
      if (offer.status !== "pending") {
        historyEntries.push({
          id: `outgoing-${offer.id}`,
          kind: "outgoing",
          status: offer.status,
          updatedAt: offer.updatedAt || offer.createdAt || null,
          title: `${offer.offeredItem?.name || offer.offeredItemId} -> ${offer.listing?.item?.name || offer.listingId}`,
          subtitle: offer.note || "No note.",
          image: offer.offeredItem?.image || "",
        });
      }
    }

    return historyEntries.sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [tradeHub.myListings, tradeHub.outgoingOffers]);

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
      await Promise.all([loadRewards(address), syncInventoryFromApi(address), loadTradeHub(address)]);

      setSuccess(
        result?.alreadyOwned
          ? `Already owned: ${item.name}`
          : result?.nft?.tokenId
          ? `Purchased: ${item.name} | NFT #${result.nft.tokenId}`
          : `Purchased: ${item.name}`
      );
    } catch (e) {
      console.error("buy failed:", e);
      setErr(String(e?.message || e));
    }
  }

  async function createTradeListing() {
    if (!isConnected || !address) {
      setErr("Connect wallet to create a trade listing.");
      return;
    }
    if (!listingItemId) {
      setErr("Choose one of your NFT items first.");
      return;
    }
    setTradeBusy("listing");
    setErr("");
    setSuccess("");
    try {
      const json = await fetchJson(`${API}/api/trades/listings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          itemId: listingItemId,
          note: listingNote.trim() || null,
        }),
      });
      setTradeHub({
        openListings: json?.openListings || [],
        myListings: json?.myListings || [],
        incomingOffers: json?.incomingOffers || [],
        outgoingOffers: json?.outgoingOffers || [],
        tradeOperatorAddress: json?.tradeOperatorAddress || null,
        tradeApprovalRequired: Boolean(json?.tradeApprovalRequired),
        viewerTradeApproved: Boolean(json?.viewerTradeApproved),
      });
      setListingItemId("");
      setListingNote("");
      setSuccess("Trade listing created.");
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setTradeBusy("");
    }
  }

  async function sendTradeOffer(listingId) {
    if (!isConnected || !address) {
      setErr("Connect wallet to send a trade offer.");
      return;
    }
    const offeredItemId = offerSelections[listingId] || "";
    if (!offeredItemId) {
      setErr("Choose which NFT item you want to offer.");
      return;
    }
    setTradeBusy(`offer:${listingId}`);
    setErr("");
    setSuccess("");
    try {
      const json = await fetchJson(`${API}/api/trades/listings/${listingId}/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          offeredItemId,
          note: (offerNotes[listingId] || "").trim() || null,
        }),
      });
      setTradeHub({
        openListings: json?.openListings || [],
        myListings: json?.myListings || [],
        incomingOffers: json?.incomingOffers || [],
        outgoingOffers: json?.outgoingOffers || [],
        tradeOperatorAddress: json?.tradeOperatorAddress || null,
        tradeApprovalRequired: Boolean(json?.tradeApprovalRequired),
        viewerTradeApproved: Boolean(json?.viewerTradeApproved),
      });
      setOfferSelections((prev) => ({ ...prev, [listingId]: "" }));
      setOfferNotes((prev) => ({ ...prev, [listingId]: "" }));
      setSuccess("Trade offer sent.");
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setTradeBusy("");
    }
  }

  async function actOnTrade(path, successMessage) {
    if (!isConnected || !address) return;
    setTradeBusy(path);
    setErr("");
    setSuccess("");
    try {
      const json = await fetchJson(`${API}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });
      setTradeHub({
        openListings: json?.openListings || [],
        myListings: json?.myListings || [],
        incomingOffers: json?.incomingOffers || [],
        outgoingOffers: json?.outgoingOffers || [],
      });
      setSuccess(successMessage);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setTradeBusy("");
    }
  }

  async function enableTradeOperator() {
    if (!isConnected || !address) {
      setErr("Connect wallet to enable NFT trading.");
      return;
    }
    if (!walletClient || !publicClient) {
      setErr("Wallet is not ready.");
      return;
    }
    if (!tradeHub.tradeOperatorAddress) {
      setErr("Trade operator is not configured on the backend.");
      return;
    }

    setTradeBusy("approveTradeOperator");
    setErr("");
    setSuccess("");
    try {
      const targetChainId = Number(tradeHub.cosmeticsChainId || rewards?.chainId || hardhat.id);
      if (chainId !== targetChainId) {
        await switchChainAsync({ chainId: targetChainId });
      }

      const hash = await walletClient.writeContract({
        account: walletClient.account,
        address: tradeHub.cosmeticsContractAddress,
        abi: greenCommuteCosmeticsAbi,
        functionName: "setApprovalForAll",
        args: [tradeHub.tradeOperatorAddress, true],
        chain: hardhat,
      });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
      });
      if (receipt.status !== "success") {
        throw new Error("Approval transaction reverted.");
      }
      await loadTradeHub(address);
      setSuccess("NFT trade approval enabled.");
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setTradeBusy("");
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

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <button
          type="button"
          className="pill"
          onClick={() => setActiveTab("shop")}
          style={{
            opacity: activeTab === "shop" ? 1 : 0.78,
            border: activeTab === "shop" ? "1px solid rgba(34,211,238,.9)" : undefined,
          }}
        >
          Shop
        </button>
        <button
          type="button"
          className="pill"
          onClick={() => setActiveTab("trade")}
          style={{
            opacity: activeTab === "trade" ? 1 : 0.78,
            border: activeTab === "trade" ? "1px solid rgba(34,211,238,.9)" : undefined,
          }}
        >
          Trade
        </button>
      </div>

      {activeTab === "shop" ? (
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
                  const cosmeticToken = getCosmeticToken(it.id);

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
                          {cosmeticToken?.tokenId ? (
                            <div className="small">
                              NFT token: <span className="mono">#{cosmeticToken.tokenId}</span>
                            </div>
                          ) : null}
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
                        Stored in <span className="mono">shop_purchases</span> and minted as ERC-1155 when the cosmetics contract is configured.
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
      ) : (
        <div className="grid">
          <div className="card" style={{ gridColumn: "span 12" }}>
            <div className="accent cyan" />
            <div className="card-inner">
              <div className="section-title">Trade Hub <span className="hint">(NFT-for-NFT offers)</span></div>
              <div className="small" style={{ marginTop: 8 }}>
                Put your NFT items up for trade, then other users can send you swap offers. When both sides enabled the trade operator, accepting the offer swaps the two ERC-1155 items.
              </div>
              {isConnected && tradeHub.tradeApprovalRequired ? (
                <div
                  style={{
                    marginTop: 12,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "center",
                    padding: 12,
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,.10)",
                    background: tradeHub.viewerTradeApproved ? "rgba(34,197,94,.10)" : "rgba(255,255,255,.03)",
                  }}
                >
                  <div className="small">
                    {tradeHub.viewerTradeApproved
                      ? "Trade approval is enabled for this wallet."
                      : "Enable the trade operator once so accepted offers can actually swap your NFT items."}
                  </div>
                  <button
                    type="button"
                    className="pill"
                    onClick={enableTradeOperator}
                    disabled={tradeBusy === "approveTradeOperator" || tradeHub.viewerTradeApproved}
                  >
                    {tradeHub.viewerTradeApproved
                      ? "Trade enabled"
                      : tradeBusy === "approveTradeOperator"
                      ? "Enabling..."
                      : "Enable NFT trades"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="card" style={{ gridColumn: "span 12" }}>
            <div className="accent green" />
            <div className="card-inner">
              <div className="section-title">Create Trade Listing</div>
              {!isConnected ? (
                <div className="small" style={{ marginTop: 10 }}>Connect wallet to open a trade listing.</div>
              ) : ownedOnChainItems.length === 0 ? (
                <div className="small" style={{ marginTop: 10 }}>
                  You do not have any active NFT cosmetics yet. Buy a new item after the cosmetics contract is configured, then it will appear here.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                  <div className="small">Choose your NFT item</div>
                  <div style={tradePickerGrid}>
                    {ownedOnChainItems.map((item) => {
                      const selected = listingItemId === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setListingItemId(item.id)}
                          style={{
                            ...tradeSelectableCard,
                            border: selected ? "1px solid rgba(34,211,238,.9)" : tradeSelectableCard.border,
                            background: selected ? "rgba(34,211,238,.12)" : tradeSelectableCard.background,
                          }}
                        >
                          <div style={tradeThumbWrap}>
                            <img
                              src={item.image}
                              alt={item.name}
                              style={tradeThumb}
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          </div>
                          <div style={{ textAlign: "left" }}>
                            <div style={{ fontWeight: 900 }}>{item.name}</div>
                            <div className="small">
                              {item.slot} #{getCosmeticToken(item.id)?.tokenId}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <input
                    value={listingNote}
                    onChange={(e) => setListingNote(e.target.value)}
                    placeholder="Optional note, for example: looking for hats or cute accessories"
                    style={tradeInput}
                  />
                  <div>
                    <button
                      type="button"
                      className="pill"
                      onClick={createTradeListing}
                      disabled={tradeBusy === "listing" || !listingItemId}
                    >
                      {tradeBusy === "listing" ? "Creating..." : "Create listing"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ gridColumn: "span 12" }}>
            <div className="accent amber" />
            <div className="card-inner">
              <div className="section-title">Open Trade Listings</div>
              <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                {tradeHub.openListings.length === 0 ? (
                  <div className="small">No trade listings are open yet.</div>
                ) : (
                  tradeHub.openListings.map((listing) => (
                    <div key={listing.id} style={tradeCard}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                          {listing.item?.image ? (
                            <div style={tradeThumbWrap}>
                              <img
                                src={listing.item.image}
                                alt={listing.item?.name || listing.itemId}
                                style={tradeThumb}
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                }}
                              />
                            </div>
                          ) : null}
                          <div>
                            <div style={{ fontWeight: 900 }}>
                              {listing.item?.name || listing.itemId} <span className="small">#{getCosmeticToken(listing.itemId)?.tokenId || "-"}</span>
                            </div>
                            <div className="small">
                              Owner: <span className="mono">{listing.owner?.customDisplayName || listing.ownerWallet}</span>
                            </div>
                            {listing.note ? <div className="small" style={{ marginTop: 6 }}>{listing.note}</div> : null}
                          </div>
                        </div>
                        <div className="badge">{listing.item?.slot || "item"}</div>
                      </div>

                      {isConnected ? (
                        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                          <div className="small">Offer one of your NFT items</div>
                          <div style={tradePickerGrid}>
                            {ownedOnChainItems
                              .filter((item) => item.id !== listing.itemId)
                              .map((item) => {
                                const selected = (offerSelections[listing.id] || "") === item.id;
                                return (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={() =>
                                      setOfferSelections((prev) => ({ ...prev, [listing.id]: item.id }))
                                    }
                                    style={{
                                      ...tradeSelectableCard,
                                      border: selected ? "1px solid rgba(34,211,238,.9)" : tradeSelectableCard.border,
                                      background: selected ? "rgba(34,211,238,.12)" : tradeSelectableCard.background,
                                    }}
                                  >
                                    <div style={tradeThumbWrap}>
                                      <img
                                        src={item.image}
                                        alt={item.name}
                                        style={tradeThumb}
                                        onError={(e) => {
                                          e.currentTarget.style.display = "none";
                                        }}
                                      />
                                    </div>
                                    <div style={{ textAlign: "left" }}>
                                      <div style={{ fontWeight: 900 }}>{item.name}</div>
                                      <div className="small">
                                        {item.slot} #{getCosmeticToken(item.id)?.tokenId}
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}
                          </div>
                          <input
                            value={offerNotes[listing.id] || ""}
                            onChange={(e) => setOfferNotes((prev) => ({ ...prev, [listing.id]: e.target.value }))}
                            placeholder="Optional trade note"
                            style={tradeInput}
                          />
                          <div>
                            <button
                              type="button"
                              className="pill"
                              onClick={() => sendTradeOffer(listing.id)}
                              disabled={tradeBusy === `offer:${listing.id}` || !offerSelections[listing.id]}
                            >
                              {tradeBusy === `offer:${listing.id}` ? "Sending..." : "Send offer"}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="card" style={{ gridColumn: "span 12" }}>
            <div className="accent purple" />
            <div className="card-inner">
              <div className="section-title">My Listings & Offers</div>
              <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                {activeMyListings.map((listing) => (
                  <div key={listing.id} style={tradeCard}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                        {listing.item?.image ? (
                          <div style={tradeThumbWrap}>
                            <img
                              src={listing.item.image}
                              alt={listing.item?.name || listing.itemId}
                              style={tradeThumb}
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          </div>
                        ) : null}
                        <div>
                          <div style={{ fontWeight: 900 }}>{listing.item?.name || listing.itemId}</div>
                          <div className="small">{listing.note || "No listing note."}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <div className="badge" style={statusBadge}>
                          {formatTradeStatus(listing.status)}
                        </div>
                        {listing.status === "open" ? (
                          <button
                            type="button"
                            className="pill"
                            onClick={() => actOnTrade(`/api/trades/listings/${listing.id}/cancel`, "Trade listing cancelled.")}
                            disabled={tradeBusy === `/api/trades/listings/${listing.id}/cancel`}
                          >
                            Cancel listing
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                      {listing.offers.length === 0 ? (
                        <div className="small">No offers yet.</div>
                      ) : (
                        listing.offers.map((offer) => (
                          <div key={offer.id} style={tradeOfferCard}>
                            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                              {offer.offeredItem?.image ? (
                                <div style={tradeThumbWrap}>
                                  <img
                                    src={offer.offeredItem.image}
                                    alt={offer.offeredItem?.name || offer.offeredItemId}
                                    style={tradeThumb}
                                    onError={(e) => {
                                      e.currentTarget.style.display = "none";
                                    }}
                                  />
                                </div>
                              ) : null}
                              <div>
                                <div style={{ fontWeight: 800 }}>
                                  {offer.offeredItem?.name || offer.offeredItemId} from {offer.offerer?.customDisplayName || offer.offererWallet}
                                </div>
                                <div className="small">{offer.note || "No note."}</div>
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <div className="badge" style={statusBadge}>
                                {formatTradeStatus(offer.status)}
                              </div>
                              {offer.status === "pending" ? (
                                <>
                                  <button
                                    type="button"
                                    className="pill"
                                    onClick={() => actOnTrade(`/api/trades/offers/${offer.id}/accept`, "Trade offer accepted.")}
                                    disabled={tradeBusy === `/api/trades/offers/${offer.id}/accept`}
                                  >
                                    Accept
                                  </button>
                                  <button
                                    type="button"
                                    className="pill"
                                    onClick={() => actOnTrade(`/api/trades/offers/${offer.id}/reject`, "Trade offer rejected.")}
                                    disabled={tradeBusy === `/api/trades/offers/${offer.id}/reject`}
                                  >
                                    Reject
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}

                {activeMyListings.length === 0 ? <div className="small">You do not have any active listings.</div> : null}

                {activeOutgoingOffers.length > 0 ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div className="section-title" style={{ fontSize: 18 }}>Outgoing Offers</div>
                    {activeOutgoingOffers.map((offer) => (
                      <div key={offer.id} style={tradeOfferCard}>
                        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                          {offer.offeredItem?.image ? (
                            <div style={tradeThumbWrap}>
                              <img
                                src={offer.offeredItem.image}
                                alt={offer.offeredItem?.name || offer.offeredItemId}
                                style={tradeThumb}
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                }}
                              />
                            </div>
                          ) : null}
                          <div>
                            <div style={{ fontWeight: 800 }}>
                              {offer.offeredItem?.name || offer.offeredItemId} {"->"} {offer.listing?.item?.name || offer.listingId}
                            </div>
                            <div className="small">{offer.note || "No note."}</div>
                          </div>
                        </div>
                        <div className="badge" style={statusBadge}>
                          {formatTradeStatus(offer.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="card" style={{ gridColumn: "span 12" }}>
            <div className="accent cyan" />
            <div className="card-inner">
              <div className="section-title">Trade History</div>
              <div className="small" style={{ marginTop: 8 }}>
                Completed, rejected and cancelled trade events live here with their latest timestamps.
              </div>
              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                {tradeHistory.length === 0 ? (
                  <div className="small">No finished trade activity yet.</div>
                ) : (
                  tradeHistory.map((entry) => (
                    <div key={entry.id} style={tradeOfferCard}>
                      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                        {entry.image ? (
                          <div style={tradeThumbWrap}>
                            <img
                              src={entry.image}
                              alt={entry.title}
                              style={tradeThumb}
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          </div>
                        ) : null}
                        <div>
                          <div style={{ fontWeight: 800 }}>{entry.title}</div>
                          <div className="small">{entry.subtitle}</div>
                          {entry.updatedAt ? (
                            <div className="small" style={{ marginTop: 4 }}>
                              {formatTradeDate(entry.updatedAt)}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="badge" style={statusBadge}>
                        {formatTradeStatus(entry.status)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const tradeInput = {
  minWidth: 240,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,.14)",
  background: "rgba(255,255,255,.06)",
  color: "rgba(255,255,255,.96)",
  padding: "10px 12px",
  outline: "none",
};

const tradeCard = {
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,.10)",
  background: "rgba(255,255,255,.03)",
  padding: 14,
};

const tradeOfferCard = {
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,.08)",
  background: "rgba(255,255,255,.025)",
  padding: 12,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
};

const tradePickerGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const tradeSelectableCard = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  width: "100%",
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,.10)",
  background: "rgba(255,255,255,.035)",
  padding: 12,
  color: "rgba(255,255,255,.96)",
  cursor: "pointer",
};

const tradeThumbWrap = {
  width: 72,
  height: 72,
  flex: "0 0 72px",
  borderRadius: 14,
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,.10)",
  background: "rgba(255,255,255,.04)",
  display: "grid",
  placeItems: "center",
};

const tradeThumb = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const statusBadge = {
  minWidth: 72,
  textAlign: "center",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  whiteSpace: "nowrap",
  padding: "6px 12px",
  borderRadius: 999,
  lineHeight: 1.1,
};
