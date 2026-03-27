"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import Nav from "../components/Nav";
import AvatarShowcase from "../components/AvatarShowcase";
import { equipItem, loadInventory, saveInventory } from "../lib/inventory";
import { API as API_BASE, getItemRarity, getItemTheme } from "../lib/api";
import {
  AVATAR_INVENTORY_SLOTS,
  AVATAR_BACKGROUND_SLOT,
  AVATAR_SLOTS,
  AVATAR_SLOT_HINTS,
  AVATAR_SLOT_LABELS,
  createEmptySlotMap,
  getItemCollectionSlot,
  getLayerZIndex,
  getSlotAnchor,
  getSlotScaleX,
  getSlotScaleY,
  isItemCompatibleWithCharacter,
} from "../lib/avatarConfig";

const API =
  process.env.NEXT_PUBLIC_GREEN_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  API_BASE;

function normalizeLayoutForApi(inv) {
  return {
    character: inv?.equipped?.character || "girl",
    equipped: inv?.equipped || {},
    offsets: inv?.offsets || {},
  };
}

function buildOwnedBySlot(ownedItems, character) {
  const map = createEmptySlotMap();
  for (const it of ownedItems) {
    if (!isItemCompatibleWithCharacter(it, character)) continue;
    (map[it.slot] || (map[it.slot] = [])).push(it);
  }
  map.accessories2 = [...(map.accessories || [])];
  return map;
}

function isAccessorySlot(slot) {
  return slot === "accessories" || slot === "accessories2";
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

async function fetchLayoutFromApi(walletAddress) {
  return fetchJson(`${API}/api/avatar-layout/${walletAddress}`, {
    cache: "no-store",
  });
}

async function fetchInventoryFromApi(walletAddress) {
  return fetchJson(`${API}/api/users/${walletAddress}/inventory`, {
    cache: "no-store",
  });
}

async function saveLayoutToApi(walletAddress, inv) {
  return fetchJson(`${API}/api/avatar-layout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      walletAddress,
      layout: normalizeLayoutForApi(inv),
      savedBySource: "avatar",
    }),
  });
}

export default function AvatarPage() {
  const { address, isConnected } = useAccount();

  const [items, setItems] = useState([]);
  const [inv, setInv] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [activeDragSlot, setActiveDragSlot] = useState(null);
  const [activeWardrobeSlot, setActiveWardrobeSlot] = useState("wallpaper");
  const [expandedOffsetSlot, setExpandedOffsetSlot] = useState(null);
  const [storageStatus, setStorageStatus] = useState("loading");
  const [layoutMessage, setLayoutMessage] = useState("");
  const [stageSize, setStageSize] = useState(560);
  const [outfitPresets, setOutfitPresets] = useState([]);
  const [presetName, setPresetName] = useState("");
  const [presetBusy, setPresetBusy] = useState(false);
  const [shareMessage, setShareMessage] = useState("");

  const saveTimerRef = useRef(null);
  const dragHandleRef = useRef(null);
  const stageRef = useRef(null);
  const dragStateRef = useRef({ dragging: false, startX: 0, startY: 0, startOx: 0, startOy: 0 });

  const key = isConnected && address ? address.toLowerCase() : "guest";

  useEffect(() => {
    fetch("/items/items.json", { cache: "no-store" })
      .then((r) => r.json())
      .then(setItems)
      .catch((e) => {
        console.error("Failed to load items.json:", e);
        setItems([]);
      });
  }, []);

  useEffect(() => {
    const node = stageRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const next = Math.max(1, Math.round(node.getBoundingClientRect().width || 560));
      setStageSize(next);
    };
    update();
    const observer = new ResizeObserver(() => update());
    observer.observe(node);
    return () => observer.disconnect();
  }, [editMode]);

  useEffect(() => {
    let cancelled = false;
    async function loadPresets() {
      if (!isConnected || !address) {
        setOutfitPresets([]);
        return;
      }
      try {
        const json = await fetchJson(`${API}/api/users/${address}/outfit-presets`, { cache: "no-store" });
        if (!cancelled) setOutfitPresets(json?.presets || []);
      } catch (e) {
        if (!cancelled) console.error("Failed to load outfit presets:", e);
      }
    }
    loadPresets();
    return () => {
      cancelled = true;
    };
  }, [isConnected, address]);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      const local = loadInventory(key);

      if (!isConnected || !address) {
        if (!cancelled) {
          setInv(local);
          setStorageStatus("local");
          setLayoutMessage("Using local storage (wallet not connected)");
        }
        return;
      }

      try {
        const [layoutJson, inventoryJson] = await Promise.all([
          fetchLayoutFromApi(address),
          fetchInventoryFromApi(address),
        ]);
        if (cancelled) return;

        const ownedFromApi = Array.isArray(inventoryJson?.ownedItemIds) ? inventoryJson.ownedItemIds : [];
        const mergedOwned = [...new Set([...(local?.owned || []), ...ownedFromApi])];

        if (layoutJson?.exists && layoutJson?.layout) {
          const next = {
            ...local,
            owned: mergedOwned,
            equipped: {
              ...(local?.equipped || {}),
              ...(layoutJson.layout.equipped || {}),
            },
            offsets: {
              ...(local?.offsets || {}),
              ...(layoutJson.layout.offsets || {}),
            },
          };

          if (layoutJson.layout.character) {
            next.equipped = next.equipped || {};
            next.equipped.character = layoutJson.layout.character;
          }

          saveInventory(key, next);
          setInv(next);
          setStorageStatus("api");
          setLayoutMessage("Loaded from API/MySQL");
        } else {
          const next = {
            ...local,
            owned: mergedOwned,
          };
          saveInventory(key, next);
          setInv(next);
          setStorageStatus("local");
          setLayoutMessage("Loaded inventory from API, using local layout");
        }
      } catch (e) {
        if (cancelled) return;
        console.error("Avatar load API failed:", e);
        setInv(local);
        setStorageStatus("error");
        setLayoutMessage(`API load failed, using local storage (${e.message})`);
      }
    }

    loadAll();

    return () => {
      cancelled = true;
    };
  }, [key, isConnected, address]);

  function persistLocal(next) {
    saveInventory(key, next);
    setInv(next);
  }

  function persist(next) {
    persistLocal(next);

    if (!isConnected || !address) {
      setStorageStatus("local");
      setLayoutMessage("Saved locally (wallet not connected)");
      return;
    }

    setStorageStatus("api");
    setLayoutMessage("Saving to API/MySQL...");

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await saveLayoutToApi(address, next);
        setStorageStatus("api");
        setLayoutMessage("Saved to API/MySQL");
      } catch (e) {
        console.error("saveLayoutToApi failed:", e);
        setStorageStatus("error");
        setLayoutMessage(`Save failed, kept in local storage (${e.message})`);
      }
    }, 250);
  }

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const equipped = inv?.equipped || {};
  const offsets = inv?.offsets || {};
  const character = equipped.character || "girl";
  const filteredItems = useMemo(
    () => items.filter((item) => isItemCompatibleWithCharacter(item, character)),
    [items, character],
  );
  const ownedItems = useMemo(() => {
    if (!inv) return [];
    const ownedSet = new Set(inv.owned || []);
    return items.filter((it) => ownedSet.has(it.id));
  }, [inv, items]);
  const ownedBySlot = useMemo(() => buildOwnedBySlot(ownedItems, character), [ownedItems, character]);
  const itemMap = useMemo(() => new Map(filteredItems.map((it) => [it.id, it])), [filteredItems]);
  const wallpaperItem = equipped?.[AVATAR_BACKGROUND_SLOT] ? itemMap.get(equipped[AVATAR_BACKGROUND_SLOT]) || null : null;
  const equippedSlots = AVATAR_SLOTS.filter((slot) => Boolean(equipped?.[slot]));
  const effectiveActiveDragSlot = activeDragSlot && equipped?.[activeDragSlot] ? activeDragSlot : null;
  const activeWardrobeItems = ownedBySlot[getItemCollectionSlot(activeWardrobeSlot)] || [];

  const layers = useMemo(() => {
    const base = character === "boy" ? "/avatars/base/boy.png" : "/avatars/base/girl.png";
    return [
      { slot: "base", src: base, z: 1 },
      ...AVATAR_SLOTS.map((slot) => ({
        slot,
        src: equipped[slot] ? itemMap.get(equipped[slot])?.image || null : null,
        item: equipped[slot] ? itemMap.get(equipped[slot]) || null : null,
        z: getLayerZIndex(slot),
      })),
    ];
  }, [character, equipped, itemMap]);

  function getOffset(slot) {
    const o = offsets?.[slot];
    if (o && (o.xPct !== undefined || o.yPct !== undefined)) {
      return {
        x: Number(o?.xPct || 0) * stageSize,
        y: Number(o?.yPct || 0) * stageSize,
      };
    }
    return { x: Number(o?.x || 0), y: Number(o?.y || 0) };
  }

  function setOffset(slot, nextXY) {
    if (!inv) return;
    const next = structuredClone(inv);
    next.offsets = next.offsets || {};
    next.offsets[slot] = {
      xPct: Number(nextXY.x || 0) / Math.max(1, stageSize),
      yPct: Number(nextXY.y || 0) / Math.max(1, stageSize),
    };
    persist(next);
  }

  function resetOffset(slot) {
    if (!inv) return;
    const next = structuredClone(inv);
    next.offsets = next.offsets || {};
    delete next.offsets[slot];
    persist(next);
  }

  function nudge(slot, dx, dy) {
    const cur = getOffset(slot);
    setOffset(slot, { x: cur.x + dx, y: cur.y + dy });
  }

  function switchCharacter(nextCharacter) {
    if (!inv) return;
    const next = structuredClone(inv);
    next.equipped = next.equipped || {};
    next.equipped.character = nextCharacter;

    for (const slot of AVATAR_SLOTS) {
      const itemId = next.equipped[slot];
      if (!itemId) continue;
      const item = items.find((it) => it.id === itemId);
      if (item && !isItemCompatibleWithCharacter(item, nextCharacter)) {
        delete next.equipped[slot];
      }
    }

    persist(next);
  }

  function equip(slot, itemId) {
    if (!inv) return;
    if (isAccessorySlot(slot)) {
      const otherAccessorySlot = slot === "accessories" ? "accessories2" : "accessories";
      if (inv?.equipped?.[otherAccessorySlot] === itemId) {
        setLayoutMessage("This accessory is already equipped in the other accessory slot.");
        setStorageStatus("error");
        return;
      }
    }
    const next = equipItem(structuredClone(inv), slot, itemId);
    persist(next);
  }

  function unequip(slot) {
    if (!inv) return;
    const next = structuredClone(inv);
    next.equipped = next.equipped || {};
    delete next.equipped[slot];
    if (activeDragSlot === slot) setActiveDragSlot(null);
    if (expandedOffsetSlot === slot) setExpandedOffsetSlot(null);
    persist(next);
  }

  function toggleEditMode() {
    setEditMode((prev) => {
      const next = !prev;
      if (!next) {
        setActiveDragSlot(null);
        setExpandedOffsetSlot(null);
        dragStateRef.current = { dragging: false, startX: 0, startY: 0, startOx: 0, startOy: 0 };
      }
      return next;
    });
  }

  async function saveCurrentPreset() {
    if (!isConnected || !address || !presetName.trim() || !inv || presetBusy) return;
    setPresetBusy(true);
    setShareMessage("");
    try {
      const json = await fetchJson(`${API}/api/users/${address}/outfit-presets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presetName: presetName.trim(),
          layout: normalizeLayoutForApi(inv),
        }),
      });
      setOutfitPresets(json?.presets || []);
      setPresetName("");
      setLayoutMessage("Outfit preset saved.");
    } catch (e) {
      setStorageStatus("error");
      setLayoutMessage(String(e?.message || e));
    } finally {
      setPresetBusy(false);
    }
  }

  function applyPreset(preset) {
    if (!preset?.layout) return;
    const next = structuredClone(inv || {});
    next.equipped = {
      ...(next.equipped || {}),
      ...(preset.layout.equipped || {}),
    };
    next.offsets = {
      ...(next.offsets || {}),
      ...(preset.layout.offsets || {}),
    };
    next.equipped.character = preset.layout.character || next.equipped.character || "girl";
    setActiveDragSlot(null);
    setExpandedOffsetSlot(null);
    persist(next);
    setLayoutMessage(`Applied preset: ${preset.name}`);
  }

  async function deletePreset(presetId) {
    if (!isConnected || !address || presetBusy) return;
    setPresetBusy(true);
    try {
      const json = await fetchJson(`${API}/api/users/${address}/outfit-presets/${presetId}`, {
        method: "DELETE",
      });
      setOutfitPresets(json?.presets || []);
    } catch (e) {
      setStorageStatus("error");
      setLayoutMessage(String(e?.message || e));
    } finally {
      setPresetBusy(false);
    }
  }

  async function copyShareCard() {
    const profileUrl = isConnected && address ? `${window.location.origin}/community/${address.toLowerCase()}` : window.location.href;
    try {
      await navigator.clipboard.writeText(profileUrl);
      setShareMessage("Public profile link copied.");
    } catch {
      setShareMessage(profileUrl);
    }
  }

  function onGlobalHandlePointerDown(e) {
    const slot = effectiveActiveDragSlot;
    if (!editMode || !slot || !equipped[slot]) return;
    if (typeof e.button === "number" && e.button !== 0) return;
    e.preventDefault();

    const cur = getOffset(slot);
    dragStateRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startOx: cur.x,
      startOy: cur.y,
    };

    try {
      dragHandleRef.current?.setPointerCapture(e.pointerId);
    } catch {}
  }

  function onGlobalHandlePointerMove(e) {
    const st = dragStateRef.current;
    if (!st.dragging || !effectiveActiveDragSlot) return;

    const dx = Math.round(e.clientX - st.startX);
    const dy = Math.round(e.clientY - st.startY);
    setOffset(effectiveActiveDragSlot, { x: st.startOx + dx, y: st.startOy + dy });
  }

  function onGlobalHandlePointerUp(e) {
    if (!dragStateRef.current.dragging) return;
    dragStateRef.current.dragging = false;
    try {
      dragHandleRef.current?.releasePointerCapture(e.pointerId);
    } catch {}
  }

  const activeHandlePos = effectiveActiveDragSlot
    ? getGlobalHandlePosition(effectiveActiveDragSlot, getOffset(effectiveActiveDragSlot))
    : null;

  return (
    <div className="shell">
      <Nav />

      <div className="topbar">
        <div className="title">
          <h1 className="h1">Avatar</h1>
        </div>

        <div className="pills" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
          <button
            onClick={toggleEditMode}
            className="pill"
            style={{
              display: "inline-flex",
              border: "1px solid var(--ui-soft-border)",
              background: editMode
                ? "color-mix(in srgb, var(--ui-soft-bg) 55%, var(--card2) 45%)"
                : "var(--ui-soft-bg)",
              color: "var(--ui-soft-text)",
              cursor: "pointer",
              fontWeight: 900,
            }}
          >
            {editMode ? "Edit mode: ON" : "Edit mode: OFF"}
          </button>
        </div>
      </div>

      <div className="grid">
        <div
          className="card"
          style={{
            gridColumn: editMode ? "span 7" : "span 12",
            maxWidth: editMode ? "none" : 760,
            width: "100%",
            justifySelf: editMode ? "stretch" : "center",
          }}
        >
          <div className="accent cyan" />
          <div className="card-inner">
            <div className="section-title">
              Preview <span className="hint">(drag with cursor when Edit mode is on)</span>
            </div>

            <div className="small" style={{ marginTop: 6 }}>
              Storage status:{" "}
              <span
                style={{
                  color:
                    storageStatus === "api"
                      ? "#86efac"
                      : storageStatus === "local"
                      ? "#fcd34d"
                      : storageStatus === "error"
                      ? "#fca5a5"
                      : "var(--muted)",
                  fontWeight: 800,
                }}
              >
                {storageStatus}
              </span>
            </div>

            {layoutMessage ? (
              <div
                className="small"
                style={{
                  marginTop: 6,
                  color: storageStatus === "error" ? "#fca5a5" : "var(--muted)",
                }}
              >
                {layoutMessage}
              </div>
            ) : null}

            <div
              ref={stageRef}
              className="avatar-stage"
              style={{
                cursor: editMode ? "grab" : "default",
                marginTop: 12,
                position: "relative",
                width: "min(100%, 560px)",
                marginInline: "auto",
              }}
              onPointerDown={onGlobalHandlePointerDown}
              onPointerMove={onGlobalHandlePointerMove}
              onPointerUp={onGlobalHandlePointerUp}
              onPointerCancel={onGlobalHandlePointerUp}
            >
              {wallpaperItem?.image ? (
                <img
                  src={wallpaperItem.image}
                  alt=""
                  draggable={false}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    borderRadius: 28,
                    pointerEvents: "none",
                    userSelect: "none",
                    zIndex: 0,
                  }}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : null}
              {layers.map((l) => (
                <Layer key={l.slot} slot={l.slot} src={l.src} item={l.item} zIndex={l.z} getOffset={getOffset} />
              ))}

              {editMode && effectiveActiveDragSlot && activeHandlePos ? (
                <div
                  ref={dragHandleRef}
                  className="avatar-drag-handle avatar-drag-handle-global"
                  style={{
                    left: `calc(${activeHandlePos.leftPct}% + ${activeHandlePos.offsetX}px)`,
                    top: `calc(${activeHandlePos.topPct}% + ${activeHandlePos.offsetY}px)`,
                  }}
                  title={`${effectiveActiveDragSlot} drag handle`}
                />
              ) : null}
            </div>

            <div className="small" style={{ marginTop: 10 }}>
              {editMode
                ? "Tip: select a slot in the editor, then fine-tune it with drag or nudges."
                : "Tip: turn Edit mode on only when you want to move clothes around."}
            </div>
          </div>
        </div>

        {editMode ? (
        <div className="card" style={{ gridColumn: "span 5", maxHeight: "78vh" }}>
          <div className="accent green" />
          <div className="card-inner" style={{ height: "100%", overflow: "auto", paddingRight: 10 }}>
            <div className="section-title">Equipped & Offsets</div>

            {!inv ? (
              <div className="small">Loading...</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="slot-row" style={compactSlotBox}>
	                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
	                    <div>
	                      <div style={{ fontWeight: 950, fontSize: 13 }}>Wallpaper</div>
	                      <div className="small" style={{ fontSize: 12 }}>
	                        current: <span className="mono">{equipped?.[AVATAR_BACKGROUND_SLOT] || "-"}</span>
	                      </div>
	                    </div>
	                  </div>
	                </div>

                <div className="slot-row" style={compactSlotBox}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 950, fontSize: 13 }}>Character</div>
                      <div className="small" style={{ fontSize: 12 }}>
                        current: <span className="mono">{character}</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => switchCharacter("boy")}
                        style={{
                          ...btnChip,
                          opacity: character === "boy" ? 1 : 0.75,
                          border: character === "boy" ? "1px solid var(--ui-soft-text)" : btnChip.border,
                        }}
                      >
                        Boy
                      </button>
                      <button
                        onClick={() => switchCharacter("girl")}
                        style={{
                          ...btnChip,
                          opacity: character === "girl" ? 1 : 0.75,
                          border: character === "girl" ? "1px solid var(--ui-soft-text)" : btnChip.border,
                        }}
                      >
                        Girl
                      </button>
                    </div>
                  </div>
                </div>

	                {equippedSlots.map((slot) => {
	                  const id = equipped[slot];
	                  const o = getOffset(slot);
                    const controlsOpen = expandedOffsetSlot === slot;

	                  return (
	                    <div key={slot} className="slot-row" style={compactSlotBox}>
	                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
	                        <div>
                          <div style={{ fontWeight: 950, fontSize: 13 }}>{AVATAR_SLOT_LABELS[slot] || slot}</div>
                          <div className="small" style={{ fontSize: 12 }}>
                            item: <span className="mono">{id || "-"}</span>
                          </div>
                          <div className="small" style={{ fontSize: 12 }}>
	                            offset: <span className="mono">{o.x}px</span>, <span className="mono">{o.y}px</span>
	                          </div>
	                        </div>
	                      </div>

	                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
	                        <button
	                          onClick={() => setExpandedOffsetSlot((prev) => (prev === slot ? null : slot))}
	                          style={{
	                            ...btnDragToggle,
	                            opacity: id ? 1 : 0.55,
	                            border:
	                              controlsOpen
	                                ? "1px solid rgba(6,182,212,.9)"
	                                : btnDragToggle.border,
	                          }}
	                          disabled={!id}
	                        >
	                          {controlsOpen ? "Hide offset controls" : "Adjust position"}
	                        </button>
	                        <span className="small" style={{ fontSize: 11 }}>{controlsOpen ? "Controls open" : ""}</span>
	                      </div>

                        {controlsOpen ? (
	                        <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
	                            <button
	                              onClick={() => setActiveDragSlot((prev) => (prev === slot ? null : slot))}
	                              style={{
	                                ...btnDrag,
	                                opacity: !editMode ? 0.45 : effectiveActiveDragSlot === slot ? 1 : 0.72,
	                                border:
	                                  effectiveActiveDragSlot === slot
	                                    ? "1px solid rgba(6,182,212,.9)"
	                                    : btnDrag.border,
	                              }}
	                              disabled={!id || !editMode}
	                            >
	                              {effectiveActiveDragSlot === slot ? "Drag selected" : `Drag ${AVATAR_SLOT_LABELS[slot] || slot}`}
	                            </button>
	                            <button onClick={() => resetOffset(slot)} style={btnReset} disabled={!id}>
	                              Reset
	                            </button>
                            </div>

	                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
	                          <button onClick={() => nudge(slot, -1, 0)} style={btnNudge} disabled={!id}>L</button>
	                          <button onClick={() => nudge(slot, 1, 0)} style={btnNudge} disabled={!id}>R</button>
	                          <button onClick={() => nudge(slot, 0, -1)} style={btnNudge} disabled={!id}>U</button>
	                          <button onClick={() => nudge(slot, 0, 1)} style={btnNudge} disabled={!id}>D</button>
	                          <button onClick={() => nudge(slot, -5, 0)} style={btnNudgeWide} disabled={!id}>-5x</button>
	                          <button onClick={() => nudge(slot, 5, 0)} style={btnNudgeWide} disabled={!id}>+5x</button>
	                          <button onClick={() => nudge(slot, 0, -5)} style={btnNudgeWide} disabled={!id}>-5y</button>
	                          <button onClick={() => nudge(slot, 0, 5)} style={btnNudgeWide} disabled={!id}>+5y</button>
	                        </div>
                          </div>
                        ) : null}
	                    </div>
	                  );
	                })}

	                {equippedSlots.length === 0 ? (
	                  <div className="small">Nothing equipped yet. Use the wardrobe below to put items on your avatar.</div>
	                ) : null}
	              </div>
            )}
          </div>
        </div>
        ) : null}

        <div className="card" style={{ gridColumn: "span 12" }}>
          <div className="accent amber" />
          <div className="card-inner">
            <div
              className="section-title"
              style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}
            >
              <span>Outfits & Share</span>
              <div className="small">Save full looks, then share your avatar profile card.</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1.2fr) minmax(260px, .8fr)", gap: 16, marginTop: 14 }}>
              <div style={miniPanel}>
                <div style={{ fontWeight: 900 }}>Saved outfits</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                  <input
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder={isConnected ? "Preset name" : "Connect wallet to save presets"}
                    disabled={!isConnected || presetBusy}
                    style={presetInput}
                  />
                  <button type="button" className="pill" onClick={saveCurrentPreset} disabled={!isConnected || presetBusy || !presetName.trim()}>
                    {presetBusy ? "Saving..." : "Save outfit"}
                  </button>
                </div>
                <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                  {outfitPresets.length === 0 ? (
                    <div className="small">No saved outfits yet.</div>
                  ) : (
                    outfitPresets.map((preset) => (
                      <div key={preset.id} style={presetRow}>
                        <div>
                          <div style={{ fontWeight: 800 }}>{preset.name}</div>
                          <div className="small">{preset.updatedAt ? new Date(preset.updatedAt).toLocaleString() : "Saved outfit"}</div>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button type="button" className="pill" onClick={() => applyPreset(preset)}>Apply</button>
                          <button type="button" className="pill" onClick={() => deletePreset(preset.id)} disabled={presetBusy}>Delete</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div style={miniPanel}>
                <div style={{ fontWeight: 900 }}>Avatar share card</div>
                <div className="small" style={{ marginTop: 6 }}>Use your public profile as a shareable card for friends and community.</div>
                <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
                  <AvatarShowcase layout={normalizeLayoutForApi(inv || {})} size={220} rounded={22} />
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                  <button type="button" className="pill" onClick={copyShareCard}>Copy profile link</button>
                  {isConnected && address ? (
                    <a href={`/community/${address.toLowerCase()}`} className="pill" style={{ display: "inline-flex" }}>
                      Open public card
                    </a>
                  ) : null}
                </div>
                {shareMessage ? <div className="small" style={{ marginTop: 8 }}>{shareMessage}</div> : null}
              </div>
            </div>
          </div>
        </div>

          <div className="card" style={{ gridColumn: "span 12" }}>
            <div className="accent green" />
            <div className="card-inner">
              <div
                className="section-title"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}
              >
                <span>Wardrobe & Inventory</span>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                {AVATAR_INVENTORY_SLOTS.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setActiveWardrobeSlot(slot)}
                    style={{
                      ...slotTab,
                      opacity: activeWardrobeSlot === slot ? 1 : 0.8,
                      border:
                        activeWardrobeSlot === slot
                          ? "1px solid rgba(34,211,238,.9)"
                          : slotTab.border,
                      background:
                        activeWardrobeSlot === slot
                          ? "color-mix(in srgb, var(--ui-soft-bg) 62%, var(--card2) 38%)"
                          : slotTab.background,
                    }}
                  >
                    {AVATAR_SLOT_LABELS[slot] || slot}
                  </button>
                ))}
              </div>

              <div style={{ marginTop: 14 }} className="small">
                {AVATAR_SLOT_HINTS[activeWardrobeSlot] || "cosmetics"}
                {" · "}equipped: <span className="mono">{equipped[activeWardrobeSlot] || "-"}</span>
              </div>

              <div className="shop-grid" style={{ marginTop: 14 }}>
                {activeWardrobeItems.map((it) => {
                  const active = equipped[activeWardrobeSlot] === it.id;
                  const duplicateAccessory =
                    isAccessorySlot(activeWardrobeSlot) &&
                    equipped[activeWardrobeSlot === "accessories" ? "accessories2" : "accessories"] === it.id;

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
                          <div className="small" style={{ marginTop: 4 }}>
                            {getItemRarity(it)} · {getItemTheme(it)}
                          </div>
                        </div>
                        <div className="badge">
                          {active ? "equipped" : duplicateAccessory ? "used in other slot" : "owned"}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => equip(activeWardrobeSlot, it.id)}
                        disabled={duplicateAccessory}
                        style={{
                          marginTop: 12,
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid var(--ui-soft-border)",
                          background: active
                            ? "color-mix(in srgb, var(--card2) 60%, var(--ui-soft-bg) 40%)"
                            : duplicateAccessory
                            ? "rgba(255,255,255,.04)"
                            : "var(--ui-soft-bg)",
                          color: "var(--ui-soft-text)",
                          cursor: duplicateAccessory ? "not-allowed" : "pointer",
                          fontWeight: 900,
                        }}
                      >
                        {active ? "Equipped" : duplicateAccessory ? "Already in other slot" : "Equip"}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                <button onClick={() => unequip(activeWardrobeSlot)} style={btnSecondary}>
                  Unequip {AVATAR_SLOT_LABELS[activeWardrobeSlot] || activeWardrobeSlot}
                </button>
                <a href="/shop" className="pill" style={{ display: "inline-flex" }}>
                  Buy more items
                </a>
              </div>

              {activeWardrobeItems.length === 0 ? (
                <div className="small" style={{ marginTop: 10 }}>
                  No owned items for this slot yet. Buy some from the shop and they will appear here.
                </div>
              ) : null}
            </div>
          </div>
	      </div>
	    </div>
	  );
}

function Layer({ slot, src, item, getOffset, zIndex = 1 }) {
  if (!src) return null;

  const o = getOffset(slot);
  const scaleX = getSlotScaleX(slot, item);
  const scaleY = getSlotScaleY(slot, item);

  return (
    <div
      className="avatar-layer-wrap"
      style={{
        transform: `translate(${o.x}px, ${o.y}px) scale(${scaleX}, ${scaleY})`,
        transformOrigin: "50% 50%",
        zIndex,
      }}
    >
      <img
        src={src}
        alt=""
        className="avatar-layer"
        style={{
          pointerEvents: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
        draggable={false}
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    </div>
  );
}

function getGlobalHandlePosition(slot, offset) {
  const anchor = getSlotAnchor(slot);
  return {
    leftPct: anchor.leftPct,
    topPct: anchor.topPct,
    offsetX: Number(offset?.x || 0),
    offsetY: Number(offset?.y || 0),
  };
}

const btnSecondary = {
  background: "var(--ui-soft-bg)",
  color: "var(--ui-soft-text)",
  border: "1px solid var(--ui-soft-border)",
  padding: "10px 12px",
  borderRadius: 12,
  cursor: "pointer",
  fontWeight: 900,
};

const compactSlotBox = {
  padding: "10px 12px",
  borderRadius: 18,
};

const btnNudge = {
  background: "var(--ui-soft-bg)",
  color: "var(--ui-soft-text)",
  border: "1px solid var(--ui-soft-border)",
  padding: "6px 8px",
  borderRadius: 10,
  cursor: "pointer",
  fontWeight: 950,
  minWidth: 0,
  fontSize: 12,
};

const btnNudgeWide = {
  ...btnNudge,
  minWidth: 0,
};

const btnChip = {
  ...btnNudgeWide,
  padding: "7px 10px",
  minWidth: 54,
};

const btnDrag = {
  ...btnNudgeWide,
  padding: "7px 10px",
  fontSize: 12,
};

const btnDragToggle = {
  ...btnDrag,
  fontWeight: 900,
};

const btnReset = {
  ...btnSecondary,
  padding: "8px 10px",
  borderRadius: 12,
  fontSize: 12,
};

const slotTab = {
  background: "var(--ui-soft-bg)",
  color: "var(--ui-soft-text)",
  border: "1px solid var(--ui-soft-border)",
  padding: "8px 12px",
  borderRadius: 999,
  cursor: "pointer",
  fontWeight: 900,
};

const miniPanel = {
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,.10)",
  background: "rgba(255,255,255,.03)",
  padding: 14,
};

const presetInput = {
  minWidth: 220,
  flex: "1 1 240px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,.14)",
  background: "rgba(255,255,255,.06)",
  color: "rgba(255,255,255,.96)",
  padding: "10px 12px",
  outline: "none",
};

const presetRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  padding: 10,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,.08)",
  background: "rgba(255,255,255,.02)",
};
