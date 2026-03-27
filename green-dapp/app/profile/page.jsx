"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useChainId } from "wagmi";
import Nav from "../components/Nav";
import ClaimOnChainButton from "../../components/ClaimOnChainButton";
import AvatarShowcase from "../components/AvatarShowcase";

const API =
  process.env.NEXT_PUBLIC_GREEN_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:4100";

function shortAddr(a) {
  if (!a) return "";
  return a.slice(0, 6) + "…" + a.slice(-4);
}

function fmt(n, digits = 3) {
  if (n === null || n === undefined) return "—";
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n);
  return num.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return String(v);
  return d.toLocaleString();
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
      : (json?.error || "Request failed");
    throw new Error(msg);
  }

  return json;
}

export default function ProfilePage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState(null);
  const [claimPreview, setClaimPreview] = useState(null);
  const [claims, setClaims] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [avatarLayout, setAvatarLayout] = useState(null);

  const [claimAmount, setClaimAmount] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [claimLoading, setClaimLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => setMounted(true), []);

  async function loadAll(addr, { silent = false } = {}) {
    if (!silent) {
      setErr("");
      setInfo("");
      setData(null);
      setClaimPreview(null);
      setClaims([]);
      setPurchases([]);
      setAvatarLayout(null);
    } else {
      setRefreshing(true);
    }

    try {
      const [rewardsJson, previewJson, claimsJson, purchasesJson, avatarJson] = await Promise.all([
        fetchJson(`${API}/api/users/${addr}/rewards`, { cache: "no-store" }),
        fetchJson(`${API}/api/users/${addr}/claim-preview`, { cache: "no-store" }),
        fetchJson(`${API}/api/users/${addr}/claims`, { cache: "no-store" }),
        fetchJson(`${API}/api/users/${addr}/purchases`, { cache: "no-store" }),
        fetchJson(`${API}/api/avatar-layout/${addr}`, { cache: "no-store" }),
      ]);

      setData(rewardsJson);
      setClaimPreview(previewJson);
      setClaims(Array.isArray(claimsJson?.claims) ? claimsJson.claims : []);
      setPurchases(Array.isArray(purchasesJson?.purchases) ? purchasesJson.purchases : []);
      setAvatarLayout(avatarJson?.layout || null);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setRefreshing(false);
    }
  }

  async function createClaim() {
    setErr("");
    setInfo("");

    if (!isConnected || !address) {
      setErr("Connect wallet first.");
      return;
    }

    const amount = Number(claimAmount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      setErr("Enter a valid positive claim amount.");
      return;
    }

    if (data?.claimableTokens != null && amount > Number(data.claimableTokens)) {
      setErr(`Requested amount exceeds claimable balance (${data.claimableTokens}).`);
      return;
    }

    try {
      setClaimLoading(true);

      const json = await fetchJson(`${API}/api/users/${address}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountTokens: amount }),
      });

      setInfo(`Claim created: ${json.amountTokens} ${data?.token || "GCT"} (status: ${json.claimStatus})`);
      setClaimAmount("");

      await loadAll(address, { silent: true });
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setClaimLoading(false);
    }
  }

  useEffect(() => {
    if (mounted && isConnected && address) loadAll(address);
  }, [mounted, isConnected, address]);

  const tokenSymbol = data?.token || "GCT";
  const walletLabel = mounted ? (isConnected && address ? address : "Not connected") : "Loading wallet…";

  return (
    <div className="shell">
      <Nav />
      <div className="topbar">
        <div className="title">
          <h1 className="h1">Profile</h1>
          <p className="subtitle">Rewards + claims + purchases. Submitted claims can be completed on-chain.</p>
        </div>
      </div>

      <div className="grid">
        <div className="card" style={{ gridColumn: "span 4" }}>
          <div className="accent green" />
          <div className="card-inner">
            <div className="section-title">Avatar <span className="hint">current look</span></div>
            <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
              <AvatarShowcase layout={avatarLayout} size={280} rounded={26} />
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
              <Link href="/avatar" className="pill" style={linkBtn}>
                Edit avatar
              </Link>
              {isConnected && address ? (
                <Link href={`/community/${address.toLowerCase()}`} className="pill" style={linkBtn}>
                  Open public profile
                </Link>
              ) : null}
            </div>
            <div className="small" style={{ marginTop: 10 }}>
              Use the Avatar page for wardrobe, presets and outfit positioning.
            </div>
          </div>
        </div>

        {/* Wallet */}
        <div className="card" style={{ gridColumn: "span 8" }}>
          <div className="accent cyan" />
          <div className="card-inner">
            <div className="section-title">
              Wallet <span className="hint">{API}</span>
            </div>

            {!mounted ? (
              <div className="small">Loading wallet state…</div>
            ) : !isConnected ? (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {connectors.map((c) => (
                  <button key={c.id} onClick={() => connect({ connector: c })} disabled={isPending} style={btnStyle}>
                    Connect {c.name}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                <div>
                  <div className="small">Address</div>
                  <div className="mono" style={{ fontSize: 14 }}>{walletLabel}</div>
                  <div className="small" style={{ marginTop: 6 }}>
                    ChainId: <span className="mono">{chainId}</span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button onClick={() => loadAll(address, { silent: true })} style={btnStyle}>
                    {refreshing ? "Refreshing…" : "Refresh"}
                  </button>
                  <button
                    onClick={() => {
                      disconnect();
                      setData(null);
                      setClaimPreview(null);
                      setClaims([]);
                      setPurchases([]);
                      setAvatarLayout(null);
                      setClaimAmount("");
                      setErr("");
                      setInfo("");
                    }}
                    style={btnStyle2}
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            )}

            {err && <div className="error" style={{ marginTop: 12 }}>Error: {err}</div>}

            {info && (
              <div style={{ marginTop: 12, border: "1px solid rgba(52,211,153,.25)", background: "rgba(52,211,153,.08)", color: "rgba(255,255,255,.92)", borderRadius: 14, padding: "12px 14px" }}>
                {info}
              </div>
            )}
          </div>
        </div>

        {/* Metrics */}
        <MetricCard colSpan={3} accent="green" title="Earned" value={data ? data.earnedTokens : mounted && isConnected ? "…" : "—"} unit={tokenSymbol} badge="from trips" />
        <MetricCard colSpan={3} accent="amber" title="On-chain" value={data ? data.spendableTokensOnChain : mounted && isConnected ? "…" : "—"} unit={tokenSymbol} badge="shop spendable" />
        <MetricCard colSpan={3} accent="cyan" title="Claimed" value={data ? data.claimedTokens : mounted && isConnected ? "…" : "—"} unit={tokenSymbol} badge="claims" />
        <MetricCard colSpan={3} accent="" title="Claimable" value={data ? data.claimableTokens : mounted && isConnected ? "…" : "—"} unit={tokenSymbol} badge="from trips" />

        <MetricCard colSpan={4} accent="green" title="Events" value={data ? data.eventsCount : mounted && isConnected ? "…" : "—"} unit="events" badge={mounted && isConnected && address ? shortAddr(address) : "no wallet"} />
        <MetricCard colSpan={4} accent="amber" title="Distance" value={data ? data.breakdown?.distanceKm : mounted && isConnected ? "…" : "—"} unit="km" badge="sum" />
        <MetricCard colSpan={4} accent="cyan" title="CO₂ saved" value={data ? data.breakdown?.co2SavedKg : mounted && isConnected ? "…" : "—"} unit="kg" badge="estimate" />

        {/* Claim create */}
        <div className="card" style={{ gridColumn: "span 12" }}>
          <div className="accent green" />
          <div className="card-inner">
            <div className="section-title">Create Claim <span className="hint">(status: submitted)</span></div>

            {!mounted || !isConnected ? (
              <div className="small">Connect wallet first.</div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap", marginTop: 8 }}>
                  <div>
                    <div className="small" style={{ marginBottom: 6 }}>Claim preview</div>
                    <div className="mono">{claimPreview ? `${claimPreview.claimableTokens} ${tokenSymbol}` : "Loading…"}</div>
                  </div>

                  <div>
                    <div className="small" style={{ marginBottom: 6 }}>Amount to claim</div>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={claimAmount}
                      onChange={(e) => setClaimAmount(e.target.value)}
                      placeholder={`e.g. ${data?.claimableTokens || 10}`}
                      style={inputStyle}
                    />
                  </div>

                  <button onClick={createClaim} disabled={claimLoading} style={btnStyle}>
                    {claimLoading ? "Creating claim…" : "Create Claim"}
                  </button>
                </div>

                <div className="small" style={{ marginTop: 10 }}>
                  Next step: use the &quot;Claim on-chain&quot; action in claim history.
                </div>
              </>
            )}
          </div>
        </div>

        {/* Claim history */}
        <div className="card" style={{ gridColumn: "span 12" }}>
          <div className="accent cyan" />
          <div className="card-inner">
            <div className="section-title">Claim history <span className="hint">(on-chain flow)</span></div>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Status</th>
                    <th className="right">Amount</th>
                    <th>Nonce</th>
                    <th>Created</th>
                    <th>Expiry</th>
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!mounted || !isConnected ? (
                    <tr><td colSpan={7} className="small">Connect wallet first.</td></tr>
                  ) : claims.length === 0 ? (
                    <tr><td colSpan={7} className="small">No claims yet.</td></tr>
                  ) : (
                    claims.map((c) => {
                      const isSubmitted = c.claimStatus === "submitted";
                      return (
                        <tr key={c.id}>
                          <td className="mono">{c.id}</td>
                          <td>{c.claimStatus}</td>
                          <td className="right">{fmt(c.amountTokens, 3)} {tokenSymbol}</td>
                          <td className="mono">{c.nonce || "—"}</td>
                          <td>{fmtDate(c.createdAt)}</td>
                          <td>{c.expiryTsMs ? fmtDate(c.expiryTsMs) : "—"}</td>
                          <td className="right" style={{ whiteSpace: "nowrap" }}>
                            {isSubmitted ? (
                              <ClaimOnChainButton
                                claim={c}
                                onDone={async () => {
                                  setInfo(`Claim #${c.id} confirmed on-chain.`);
                                  if (address) await loadAll(address, { silent: true });
                                }}
                              />
                            ) : (
                              <span className="small">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Purchase history */}
        <div className="card" style={{ gridColumn: "span 12" }}>
          <div className="accent amber" />
          <div className="card-inner">
            <div className="section-title">Purchase history <span className="hint">(shop_purchases)</span></div>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Item</th>
                    <th>Slot</th>
                    <th className="right">Price</th>
                    <th>Mode</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {!mounted || !isConnected ? (
                    <tr><td colSpan={6} className="small">Connect wallet first.</td></tr>
                  ) : purchases.length === 0 ? (
                    <tr><td colSpan={6} className="small">No purchases yet.</td></tr>
                  ) : (
                    purchases.map((p) => (
                      <tr key={p.id}>
                        <td className="mono">{p.id}</td>
                        <td>{p.itemName || p.itemId}</td>
                        <td>{p.slotName || "—"}</td>
                        <td className="right">{fmt(p.priceTokens, 3)} {tokenSymbol}</td>
                        <td>{p.purchaseMode || "api"}</td>
                        <td>{fmtDate(p.createdAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, unit, badge, accent = "", colSpan = 4 }) {
  const span = `span ${colSpan}`;
  return (
    <div className="card" style={{ gridColumn: span }}>
      <div className={`accent ${accent}`} />
      <div className="card-inner">
        <div className="card-header">
          <div className="card-title">{title}</div>
          <div className="badge">{badge}</div>
        </div>
        <div className="metric">
          <div className="metric-value">{value}</div>
          <div className="metric-unit">{unit}</div>
        </div>
      </div>
    </div>
  );
}

const btnStyle = {
  background: "rgba(255,255,255,.08)",
  color: "rgba(255,255,255,.92)",
  border: "1px solid rgba(255,255,255,.14)",
  padding: "10px 12px",
  borderRadius: 12,
  cursor: "pointer",
  fontWeight: 800,
};

const btnStyle2 = {
  ...btnStyle,
  background: "rgba(255,255,255,.04)",
  color: "rgba(255,255,255,.70)",
};

const inputStyle = {
  background: "rgba(255,255,255,.06)",
  color: "rgba(255,255,255,.92)",
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 12,
  padding: "10px 12px",
  outline: "none",
  minWidth: 180,
};

const linkBtn = {
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};


