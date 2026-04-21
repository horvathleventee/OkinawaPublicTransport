# Green Commute - Cheat Sheet (2 Pages)

**Green Commute** rewards users (GCT tokens) for eco-friendly transport. Built on Ethereum Sepolia with embedded wallets & gasless transactions.

---

## 📄 Page Overview

| Page | What | How |
|------|------|-----|
| **Analytics** | Trip count, distance, earned GCT | Backend queries `/api/stats/summary` (MySQL) |
| **Avatar** | Customize avatar with cosmetics | Loads from localStorage `inventory`; displays base + items (PNG layers) |
| **Shop** | Buy cosmetics with GCT tokens | Select item → `smartClient.sendTransaction()` (gasless) → `transfer()` to burn address → Backend mints NFT |
| **Profile** | GCT balance, pending claims | Fetches `/api/users/{address}/rewards` from backend |
| **Rewards** | Claim earned GCT (signature-based) | Backend signs claim → Frontend calls `claimReward()` on smart contract |
| **Community** | Groups, voting, crown rewards | Vote = POST → Backend rewards GCT; crown claim same as rewards flow |
| **Chat** | Basic messaging (UI only) | Placeholder; no backend integration |
| **Dummy** | Test data generator (port 3001) | Sends mock trips → Backend calculates rewards via `/api/transit/calculate` |

---

## 🔐 Auth & Wallet (Tech)

**Google OAuth + Embedded Wallet:**
- User clicks "Login with Google" → Alchemy Account Kit popup
- Account Kit creates LightAccount (smart contract wallet, Sepolia)
- No seed phrase; wallet stored on Alchemy
- `useWallet()` hook returns `{ address, smartClient, isEmbedded }`

**Gasless Transactions:**
- UserOp sent to Alchemy bundler
- Gas Manager (policyId: `c39e50cb-042a-...`) sponsors gas
- Middleware adds `paymasterAndData` → bundler accepts
- No gas fees for user

---

## 💰 Key Flows (Developer)

### Claim Reward (Token)
```
Frontend → POST /api/claims/{id}/sign (backend signs off-chain)
← { walletAddress, amount, signature, nonce, expiry }
Frontend → smartClient.sendTransaction( claimReward(...) )
← txHash
Frontend → POST /api/claims/{id}/confirm { txHash }
```
**Files:** `ClaimOnChainButton.jsx` | `green-api/index.js`

### Shop Purchase (Token Burn)
```
Frontend → encodeFunctionData( transfer(burnAddr, tokenAmount) )
Frontend → smartClient.sendTransaction(...)  // gasless via Alchemy
← txHash (UserOp mined)
Frontend → POST /api/shop/purchase { walletAddress, itemId, txHash }
← { nft: { tokenId } }
Frontend → Save to localStorage inventory
```

### Avatar Display
```
Backend queries DB → returns { slot: "shirt", image: "url/..." }
Frontend → renders base avatar PNG
+ overlay each cosmetic PNG (shirts, hats, shoes, etc.)
```

---

## 🏗️ Contracts & Config

**Sepolia Addresses:**
- GCT Token: `0xA97c9c0E43E7a2484BA53271Ab0124f83378d492`
- Cosmetics NFT: `0xBE775a9783Cd4abDa6bf1d4617E9251F370fa5f5`

**Critical Env Vars:**
```
NEXT_PUBLIC_ALCHEMY_API_KEY=...
NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID=c39e50cb-...  # ← Gas sponsorship
NEXT_PUBLIC_AA_ENABLED=true
GCT_CONTRACT_ADDRESS=0xA97c...
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/...
```

---

## ⚡ Build & Run

**Frontend (18 min, 2GB RAM):**
```bash
npm run build  # Webpack + 1536MB Node heap
pm2 start npm -- start --name green-dapp  # Port 3000
```

**Backend (MySQL):**
```bash
pm2 start green-api/index.js --name green-api  # Port 4100
```

**Proxy:** Nginx on okinawapt.xyz (HTTPS, Let's Encrypt)

---

## 🐛 Common Fixes

| Error | Root Cause | Solution |
|-------|-----------|----------|
| `sendTransaction not a function` | Using wrong hook | Switch to `useSmartAccountClient({ type: "LightAccount" })` |
| `sender balance is 0` | policyId not in createConfig | Move policyId to `createConfig()` in `accountKitConfig.js` |
| `.env not loading` | PM2 runs from different cwd | Use `require("dotenv").config({ path: path.resolve(__dirname, ".env") })` |
| 502 Gateway | Frontend crashed | Check PM2 logs: `pm2 logs green-dapp` |

---

## 🎯 Demo

**User Journey:** Login (Google) → Avatar page → Buy cosmetic → Confirm → Shop NFT appears  
**Dev:** Call dummy API (port 3001) → triggers `/api/transit/calculate` → mock rewards → user can claim

**Contracts:** Both on Sepolia testnet; verify at https://sepolia.etherscan.io  
**Alchemy:** Check UserOp status & gas sponsorship at https://dashboard.alchemy.com

---

*Last: Apr 21, 2026 | Status: ✅ Production (testnet)*
