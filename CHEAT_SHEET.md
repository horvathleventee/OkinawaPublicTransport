# Green Commute - Cheat Sheet

## 🚀 Quick Overview

**Green Commute** is a dApp that rewards users with tokens (GCT) for using public transportation. Users create avatars, purchase cosmetics with earned tokens, and participate in community challenges.

---

## 📱 User Perspective (Layman)

### Dashboard / Analytics
- **What:** View your total trips, distance traveled, and tokens earned.
- **How:** Log in → Analytics page shows stats immediately.

### Avatar & Cosmetics
- **What:** Create and customize your avatar with cosmetics (hats, shirts, shoes, etc.).
- **How:** 
  1. Go to Avatar page
  2. Claim rewards from dummy data or real trips
  3. Visit Shop to buy cosmetics with earned GCT tokens
  4. Select item → "Claim on-chain" → approve via embedded wallet

### Profile & Rewards
- **What:** Check your balance, completed transactions, and claim eligibility.
- **How:** Profile page shows GCT balance and pending claims with "Claim on-chain" buttons.

### Community / Crown Rewards
- **What:** Join communities, vote in groups, compete for exclusive crown rewards.
- **How:** Community page → select group → vote or claim crown if eligible.

---

## 🔧 Developer Perspective

### Tech Stack
- **Frontend:** Next.js 16 (React 19) + Wagmi + Alchemy Account Kit
- **Backend:** Express.js + MySQL
- **Blockchain:** Ethereum Sepolia testnet
- **Auth:** Google OAuth (via Alchemy Account Kit)
- **Wallet:** Embedded wallets (Account Kit LightAccount) + MetaMask support

### Key Flows

#### 1. **Embedded Wallet (Google Login)**
```
User clicks "Login with Google" 
  → Alchemy Account Kit handles OAuth popup
  → Creates LightAccount smart contract wallet on Sepolia
  → No seed phrase needed (stored with Alchemy)
  → Ready for gasless transactions
```

**Why embedded?** Layperson users don't manage wallets; app handles it transparently.

---

#### 2. **Gasless Transactions (Fee Sponsorship)**
```
User clicks "Buy Cosmetic" 
  → Frontend sends UserOp to Alchemy bundler
  → Alchemy Gas Manager (policyId: c39e50cb...) evaluates if eligible
  → If approved → Gas Manager pays for the tx
  → If rejected → "Balance is 0" error (user would need to fund themselves)
```

**Gas Policy Config:**
- Network: Ethereum Sepolia
- Type: Sponsor gas
- Mined ops: 15+ (unlimited for testnet)
- Contracts allowed: GCT (0xA97c...) + Cosmetics (0xBE77...)

---

#### 3. **Token Claim Flow**
```
Backend generates claim signature (off-chain)
  → Frontend requests claim with wallet address
  → Backend returns signed payload + amount + nonce
  → Frontend calls smart contract claimReward(...)
  → Tx mined → confirm on backend → mark as claimed
```

**Key Files:**
- `green-dapp/components/ClaimOnChainButton.jsx` — claim UI
- `green-api/index.js` — `/api/claims/:id/sign` endpoint
- Smart contract: `0xA97c9c0E43E7a2484BA53271Ab0124f83378d492` (GCT)

---

#### 4. **Shop Purchase (Token Burn)**
```
User selects cosmetic → clicks "Buy"
  → Frontend encodes transfer(burnAddress, priceInTokens)
  → Sends as UserOp (gasless via embedded wallet)
  → On success → Frontend posts to /api/shop/purchase
  → Backend mints NFT → returns with tokenId
  → Frontend updates inventory in localStorage
```

**Key Feature:** No gas fees for user. Alchemy pays for execution.

---

### Core Contract Addresses (Sepolia)

| Contract | Address |
|----------|---------|
| GCT Token | `0xA97c9c0E43E7a2484BA53271Ab0124f83378d492` |
| Cosmetics NFT | `0xBE775a9783Cd4abDa6bf1d4617E9251F370fa5f5` |

Both deployed via Hardhat scripts (`green-erc/scripts/deploy.js`).

---

### Environment Variables (Critical)

**Frontend (.env.local):**
```
NEXT_PUBLIC_ALCHEMY_API_KEY=...          # Alchemy RPC API key
NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID=c39e50cb-...  # Gas sponsorship policy
NEXT_PUBLIC_ALCHEMY_CHAIN_ID=11155111    # Sepolia = 11155111
NEXT_PUBLIC_AA_ENABLED=true              # Enable Account Kit AA
NEXT_PUBLIC_GCT_CONTRACT_ADDRESS=0xA97c...
NEXT_PUBLIC_COSMETICS_CONTRACT_ADDRESS=0xBE77...
```

**Backend (.env):**
```
DB_USER=gcapi2                           # MySQL user
DB_HOST=127.0.0.1:3306                   # Local MariaDB
GCT_CONTRACT_ADDRESS=0xA97c...
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/...
```

---

### Build & Deployment

**Frontend Build:**
```bash
# Webpack + 1536MB Node heap (memory constraint for 2GB VM)
npm run build  # ~18 min first time
pm2 start npm -- start --name green-dapp
```

**Backend:**
```bash
pm2 start ~/OkinawaPublicTransport/green-api/index.js --name green-api
```

Both behind Nginx reverse proxy on okinawapt.xyz (HTTPS/Let's Encrypt).

---

### Common Issues & Solutions

| Issue | Cause | Fix |
|-------|-------|-----|
| `sendTransaction is not a function` | Wrong hook (`useSmartWalletClient` vs `useSmartAccountClient`) | Use `useSmartAccountClient({ type: "LightAccount" })` |
| `sender balance is 0` | Gas policy not in createConfig | Add `policyId` to `createConfig()` in `accountKitConfig.js` |
| `precheck failed` | UserOp lacks `paymasterAndData` | Ensure gas manager middleware runs (policyId set correctly) |
| 502 errors | Frontend not built / crashed | Rebuild + restart PM2 |
| `.env not loading` | PM2 runs from different cwd | Use absolute path: `require("dotenv").config({ path: path.resolve(__dirname, ".env") })` |

---

### Account Kit Hooks Used

| Hook | Purpose | Returns |
|------|---------|---------|
| `useWallet()` | Unified wallet (Wagmi + Alchemy) | `{ address, isConnected, smartClient, isEmbedded }` |
| `useSmartAccountClient()` | Embedded wallet client | `{ client, address, isLoadingClient }` |
| `useAuthModal()` | Google OAuth popup | `{ openAuthModal() }` |
| `useSignerStatus()` | Check if user is logged in | `{ isConnected, isAuthenticating }` |

---

### Demo Data (Dummy Service)

**Port:** 3001 (http://localhost:3001)

Sends mock trip data to backend API (port 4100):
```
POST /api/transit/calculate
{
  "from_lat": 26.1, "from_lon": 127.6,
  "to_lat": 26.2, "to_lon": 127.7,
  "mode": "bus"  // or "rail", "park&ride"
}
```

Backend calculates reward tokens based on distance & transport mode.

---

## 🎯 Quick Demo Path

**Layperson:**
1. Visit https://okinawapt.xyz
2. Click "Login with Google" (Google popup appears)
3. Go to Avatar → Buy cosmetic → "Claim on-chain" (confirm in wallet)
4. Check Profile → see GCT balance

**Developer:**
1. Run locally: `npm run dev` (frontend) + `npm run dev` (backend)
2. Backend sends test trips to `POST /api/transit/calculate`
3. User claims rewards → trace in browser DevTools Network tab
4. Check Alchemy Dashboard for UserOp status & gas sponsorship

---

## 📊 Architecture Diagram

```
User Browser
  ↓
Next.js Frontend (Embedded Wallet + Wagmi)
  ↓
[Google OAuth] → Alchemy Account Kit
  ↓
Express.js Backend (Port 4100)
  ↓
[Alchemy Bundler + Gas Manager]
  ↓
Smart Contracts (Sepolia)
  ↓
MySQL Database
```

---

## 🔗 Useful Links

- **Alchemy Dashboard:** https://dashboard.alchemy.com
- **Sepolia Faucet:** https://sepoliafaucet.com
- **Etherscan Sepolia:** https://sepolia.etherscan.io
- **Contract ABI Docs:** `green-erc/artifacts/contracts/`
- **Deployment Scripts:** `green-erc/scripts/deploy.js`

---

**Last Updated:** April 21, 2026  
**Status:** ✅ Production (testnet)
