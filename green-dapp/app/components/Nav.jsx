"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { API } from "../lib/api";

const THEMES = [
  { id: "dark", label: "Dark", emoji: "🌙" },
  { id: "light", label: "Light", emoji: "☀️" },
  { id: "ocean", label: "Ocean", emoji: "🌊" },
  { id: "pink", label: "Pink", emoji: "🌸" },
];

export default function Nav() {
  const { isConnected, address } = useAccount();
  const [theme, setTheme] = useState("dark");
  const [chatUnread, setChatUnread] = useState(0);

  useEffect(() => {
    let timer;
    try {
      const saved = localStorage.getItem("green_theme");
      if (saved && THEMES.some((t) => t.id === saved)) {
        timer = window.setTimeout(() => setTheme(saved), 0);
      }
    } catch {}
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    try {
      document.documentElement.setAttribute("data-theme", theme);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    async function loadUnread() {
      if (!isConnected || !address) {
        setChatUnread(0);
        return;
      }
      try {
        const [inboxRes, socialRes] = await Promise.all([
          fetch(`${API}/api/users/${address}/direct-inbox`, { cache: "no-store" }),
          fetch(`${API}/api/users/${address}/social`, { cache: "no-store" }),
        ]);
        const inboxJson = await inboxRes.json().catch(() => null);
        const socialJson = await socialRes.json().catch(() => null);
        if (cancelled) return;
        const groupUnread = Array.isArray(socialJson?.groups)
          ? socialJson.groups.reduce((sum, group) => sum + Number(group?.unreadCount || 0), 0)
          : 0;
        setChatUnread(Number(inboxJson?.totalUnreadCount || 0) + groupUnread);
      } catch {
        if (!cancelled) setChatUnread(0);
      }
    }
    loadUnread();
    const timer = window.setInterval(loadUnread, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isConnected, address]);

  const dotClass = isConnected ? "dot on" : "dot off";
  const dotTitle = isConnected ? "wallet connected" : "not connected";

  function onThemeChange(nextTheme) {
    setTheme(nextTheme);
    try {
      localStorage.setItem("green_theme", nextTheme);
    } catch {}
  }

  function cycleTheme() {
    const idx = THEMES.findIndex((t) => t.id === theme);
    const next = THEMES[(idx + 1) % THEMES.length];
    onThemeChange(next.id);
  }

  const currentTheme = THEMES.find((t) => t.id === theme) || THEMES[0];

  return (
    <nav className="nav">
      <div className="nav-left">
        <div className="brand">Green Commute</div>
        <div className={dotClass} title={dotTitle} suppressHydrationWarning />
      </div>

      <div className="nav-links">
        <Link href="/" className="nav-link">Dashboard</Link>
        <Link href="/analytics" className="nav-link">Analytics</Link>
        <Link href="/community" className="nav-link">Community</Link>
        <Link href="/shop" className="nav-link">Shop</Link>
        <Link href="/chat" className="nav-link" style={{ position: "relative" }}>
          Chat
          {chatUnread > 0 ? <span style={chatBadge}>{chatUnread > 99 ? "99+" : chatUnread}</span> : null}
        </Link>
        <Link href="/profile" className="nav-link">Profile</Link>
        <Link href="/avatar" className="nav-link">Avatar</Link>

        <button className="theme-cycle-btn" onClick={cycleTheme} type="button" title="Switch theme">
          <span className="theme-emoji">{currentTheme.emoji}</span>
          <span className="theme-text">{currentTheme.label}</span>
        </button>
      </div>
    </nav>
  );
}

const chatBadge = {
  position: "absolute",
  top: -8,
  right: -10,
  minWidth: 22,
  height: 22,
  padding: "0 6px",
  borderRadius: 999,
  background: "linear-gradient(180deg, rgba(34,211,238,.95), rgba(16,185,129,.92))",
  color: "#04121b",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  fontWeight: 900,
  boxShadow: "0 8px 20px rgba(34,211,238,.28)",
};
