"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import Nav from "../../components/Nav";
import AvatarShowcase from "../../components/AvatarShowcase";
import { apiDelete, apiGet, apiPost, communityName, fmt, formatLastActive, shortAddr } from "../../lib/api";

export default function CommunityProfilePage({ params }) {
  const { address, isConnected } = useAccount();
  const resolvedParams = use(params);
  const wallet = decodeURIComponent(resolvedParams?.wallet || "").toLowerCase();
  const [mounted, setMounted] = useState(false);

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [social, setSocial] = useState({
    friends: [],
    incomingRequests: [],
    outgoingRequests: [],
  });
  const [friendLoading, setFriendLoading] = useState(false);
  const [friendMessage, setFriendMessage] = useState("");
  const [likeBusy, setLikeBusy] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const viewerQuery = address ? `?viewer=${encodeURIComponent(address)}` : "";
        const json = await apiGet(`/api/users/${wallet}/public-profile${viewerQuery}`);
        if (!cancelled) setProfile(json?.profile || null);
      } catch (e) {
        if (!cancelled) setError(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (wallet) load();
    return () => {
      cancelled = true;
    };
  }, [wallet, address]);

  useEffect(() => {
    let cancelled = false;

    async function loadSocialState() {
      if (!isConnected || !address || !wallet || address.toLowerCase() === wallet) {
        setSocial({ friends: [], incomingRequests: [], outgoingRequests: [] });
        setFriendMessage("");
        return;
      }

      setFriendLoading(true);
      setFriendMessage("");
      try {
        const json = await apiGet(`/api/users/${address}/social`);
        if (!cancelled) {
          setSocial({
            friends: json?.friends || [],
            incomingRequests: json?.incomingRequests || [],
            outgoingRequests: json?.outgoingRequests || [],
          });
        }
      } catch (e) {
        if (!cancelled) setFriendMessage(`Could not load friend state: ${String(e?.message || e)}`);
      } finally {
        if (!cancelled) setFriendLoading(false);
      }
    }

    loadSocialState();
    return () => {
      cancelled = true;
    };
  }, [isConnected, address, wallet]);

  const rewards = profile?.rewards;
  const avatarLayout = profile?.avatar?.layout;
  const canManageFriend = Boolean(mounted && isConnected && address && wallet && address.toLowerCase() !== wallet);

  useEffect(() => {
    setMounted(true);
  }, []);

  const friendState = useMemo(() => {
    const friend = social.friends.find((entry) => entry.walletAddress === wallet);
    if (friend) return { kind: "friends" };

    const incoming = social.incomingRequests.find((entry) => entry.walletAddress === wallet);
    if (incoming) return { kind: "incoming", requestId: incoming.requestId };

    const outgoing = social.outgoingRequests.find((entry) => entry.walletAddress === wallet);
    if (outgoing) return { kind: "outgoing", requestId: outgoing.requestId };

    return { kind: "none" };
  }, [social, wallet]);

  function renderFriendActions() {
    if (!canManageFriend) return null;

    if (friendState.kind === "friends") {
      return (
        <>
          <Link href={`/chat?with=${wallet}`} className="pill" style={friendBtn}>
            Open chat
          </Link>
          <button type="button" className="pill" onClick={() => updateSocial(`/api/users/${address}/friends/${wallet}`, "Friend removed.")} disabled={friendLoading} style={friendBtn}>
            {friendLoading ? "Updating..." : "Remove friend"}
          </button>
        </>
      );
    }

    if (friendState.kind === "incoming") {
      return (
        <>
          <button type="button" className="pill" onClick={() => updateSocial(`/api/users/${address}/friend-requests/${friendState.requestId}/accept`, "Friend request accepted.")} disabled={friendLoading} style={friendBtn}>
            {friendLoading ? "Updating..." : "Accept friend"}
          </button>
          <button type="button" className="pill" onClick={() => updateSocial(`/api/users/${address}/friend-requests/${friendState.requestId}/reject`, "Friend request declined.")} disabled={friendLoading} style={friendBtn}>
            {friendLoading ? "Updating..." : "Decline"}
          </button>
        </>
      );
    }

    if (friendState.kind === "outgoing") {
      return (
        <button type="button" className="pill" onClick={() => updateSocial(`/api/users/${address}/friend-requests/${friendState.requestId}/cancel`, "Friend request cancelled.")} disabled={friendLoading} style={friendBtn}>
          {friendLoading ? "Updating..." : "Cancel request"}
        </button>
      );
    }

    return (
      <button type="button" className="pill" onClick={() => updateSocial(`/api/users/${address}/friend-requests`, "Friend request sent.")} disabled={friendLoading} style={friendBtnWithBody}>
        {friendLoading ? "Updating..." : "Send friend request"}
      </button>
    );
  }

  async function updateSocial(path, successMessage) {
    if (!canManageFriend) return;
    setFriendLoading(true);
    setFriendMessage("");
    try {
      const json = path.endsWith("/friend-requests")
        ? await apiPost(path, { friendWallet: wallet })
        : path.includes("/friends/")
        ? await apiDelete(path)
        : await apiPost(path, {});

      if (json?.friends || json?.incomingRequests || json?.outgoingRequests) {
        setSocial({
          friends: json?.friends || [],
          incomingRequests: json?.incomingRequests || [],
          outgoingRequests: json?.outgoingRequests || [],
        });
      } else if (address) {
        const fallback = await apiGet(`/api/users/${address}/social`);
        setSocial({
          friends: fallback?.friends || [],
          incomingRequests: fallback?.incomingRequests || [],
          outgoingRequests: fallback?.outgoingRequests || [],
        });
      }
      setFriendMessage(successMessage);
    } catch (e) {
      setFriendMessage(String(e?.message || e));
    } finally {
      setFriendLoading(false);
    }
  }

  async function toggleLike(kind) {
    if (!isConnected || !address || !wallet || address.toLowerCase() === wallet) return;
    setLikeBusy(kind);
    try {
      const liked = kind === "profile" ? !profile?.likes?.viewerLikedProfile : !profile?.likes?.viewerLikedOutfit;
      const json = await apiPost(`/api/users/${wallet}/${kind === "profile" ? "profile-like" : "outfit-like"}`, {
        likerWallet: address,
        liked,
      });
      setProfile((prev) => (prev ? { ...prev, likes: json?.likes || prev.likes } : prev));
    } catch (e) {
      setFriendMessage(String(e?.message || e));
    } finally {
      setLikeBusy("");
    }
  }

  return (
    <div className="shell">
      <Nav />

      <div className="topbar">
        <div className="title">
          <h1 className="h1">Public Profile</h1>
        </div>
      </div>

      {error ? <div className="error">Error: {error}</div> : null}
      {friendMessage ? <div className="small" style={{ marginBottom: 12 }}>{friendMessage}</div> : null}

      <div className="grid">
        <div className="card" style={{ gridColumn: "span 5" }}>
          <div className="accent cyan" />
          <div className="card-inner">
            <div className="section-title">Avatar <span className="hint">public showcase</span></div>
            <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
              <AvatarShowcase layout={avatarLayout} size={340} rounded={28} />
            </div>
            {profile ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginTop: 14 }}>
                <div style={miniStatCard}>
                  <div className="small">Profile likes</div>
                  <div style={miniStatValue}>{fmt(profile?.likes?.profileLikes, 0)}</div>
                </div>
                <div style={miniStatCard}>
                  <div className="small">Outfit likes</div>
                  <div style={miniStatValue}>{fmt(profile?.likes?.outfitLikes, 0)}</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="card" style={{ gridColumn: "span 7" }}>
          <div className="accent green" />
          <div className="card-inner">
            <div
              className="section-title"
              style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}
            >
              <span>Public snapshot</span>
              {canManageFriend ? <span style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{renderFriendActions()}</span> : null}
            </div>

            {loading && !profile ? (
              <div className="small">Loading profile...</div>
            ) : !profile ? (
              <div className="small">Profile not found.</div>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <div className="small">Community name</div>
                  <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>
                    {communityName(profile.customDisplayName, profile.walletAddress)}
                  </div>
                </div>

                <div>
                  <div className="small">Wallet</div>
                  <div className="mono" style={{ fontSize: 14 }}>{profile.walletAddress}</div>
                  <div className="small" style={{ marginTop: 6 }}>Short: {shortAddr(profile.walletAddress)}</div>
                  <div className="small" style={{ marginTop: 6 }}>{formatLastActive(profile.presence)}</div>
                </div>

                {canManageFriend ? (
                  <div className="small" style={{ opacity: 0.9 }}>
                    Friendship state:{" "}
                    <span style={{ fontWeight: 800 }}>
                      {friendState.kind === "friends"
                        ? "friends"
                        : friendState.kind === "incoming"
                        ? "sent you a request"
                        : friendState.kind === "outgoing"
                        ? "request pending"
                        : "not connected yet"}
                    </span>
                  </div>
                ) : null}

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="pill"
                    onClick={() => toggleLike("profile")}
                    disabled={!canManageFriend || likeBusy === "profile"}
                    style={friendBtn}
                  >
                    {profile?.likes?.viewerLikedProfile ? "Unlike profile" : "Like profile"} ({fmt(profile?.likes?.profileLikes, 0)})
                  </button>
                  <button
                    type="button"
                    className="pill"
                    onClick={() => toggleLike("outfit")}
                    disabled={!canManageFriend || likeBusy === "outfit"}
                    style={friendBtn}
                  >
                    {profile?.likes?.viewerLikedOutfit ? "Unlike outfit" : "Like outfit"} ({fmt(profile?.likes?.outfitLikes, 0)})
                  </button>
                </div>

                <div className="kv">
                  <div className="kv-item">
                    <div className="kv-left"><span className="kv-label">Events</span></div>
                    <div className="kv-value">{fmt(rewards?.eventsCount, 0)}</div>
                  </div>
                  <div className="kv-item">
                    <div className="kv-left"><span className="kv-label">Distance</span></div>
                    <div className="kv-value">{fmt(rewards?.breakdown?.distanceKm, 2)} km</div>
                  </div>
                  <div className="kv-item">
                    <div className="kv-left"><span className="kv-label">CO2 saved</span></div>
                    <div className="kv-value">{fmt(rewards?.breakdown?.co2SavedKg, 3)} kg</div>
                  </div>
                  <div className="kv-item">
                    <div className="kv-left"><span className="kv-label">Purchases</span></div>
                    <div className="kv-value">{fmt(profile?.purchasesCount, 0)}</div>
                  </div>
                </div>

                <div>
                  <div className="small">Friends</div>
                  <div style={socialWrap}>
                    {(profile.friends || []).length === 0 ? (
                      <div className="small">No public friends yet.</div>
                    ) : (
                      profile.friends.map((friend) => (
                        <Link key={friend.walletAddress} href={`/community/${friend.walletAddress}`} style={socialCardLink}>
                          <div style={socialCard}>
                            <AvatarShowcase layout={friend.avatar?.layout} size={58} rounded={14} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 800 }}>{communityName(friend.customDisplayName, friend.walletAddress)}</div>
                              <div className="mono" style={{ marginTop: 4 }}>{shortAddr(friend.walletAddress)}</div>
                              <div className="small" style={{ marginTop: 4 }}>{formatLastActive(friend.presence)}</div>
                            </div>
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <div className="small">Groups</div>
                  <div style={socialWrap}>
                    {(profile.groups || []).length === 0 ? (
                      <div className="small">No groups yet.</div>
                    ) : (
                      profile.groups.map((group) => (
                        <div key={group.id} style={socialCard}>
                          <div style={groupGlyph}>{String(group.name || "?").slice(0, 1).toUpperCase()}</div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 800 }}>{group.name}</div>
                            <div className="small" style={{ marginTop: 4 }}>{fmt(group.memberCount, 0)} members</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const friendBtn = {
  cursor: "pointer",
};

const friendBtnWithBody = {
  cursor: "pointer",
};

const socialWrap = {
  display: "grid",
  gap: 10,
  marginTop: 8,
};

const socialCardLink = {
  textDecoration: "none",
  color: "inherit",
};

const socialCard = {
  display: "grid",
  gridTemplateColumns: "58px 1fr",
  gap: 10,
  alignItems: "center",
  padding: 10,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,.08)",
  background: "rgba(255,255,255,.03)",
};

const groupGlyph = {
  width: 58,
  height: 58,
  borderRadius: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 900,
  fontSize: 22,
  border: "1px solid rgba(255,255,255,.08)",
  background: "linear-gradient(180deg, rgba(34,211,238,.14), rgba(16,185,129,.12))",
};

const miniStatCard = {
  borderRadius: 14,
  padding: 12,
  border: "1px solid rgba(255,255,255,.08)",
  background: "rgba(255,255,255,.03)",
};

const miniStatValue = {
  fontWeight: 900,
  fontSize: 20,
  marginTop: 4,
};
