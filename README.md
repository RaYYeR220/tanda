# Tanda — on-chain ROSCA with an AI underwriter

> **La tanda de siempre. Sin el riesgo.** — The rotating savings circle Mexicans already
> trust, made trust-*minimized*: an AI underwriter scores each member from their on-chain
> history, the smart contract escrows every peso, and an insurance pool keeps the recipient
> whole even when someone defaults.

Built for **ETH Mexico 2026** (Bitso track). Settles in **MXNB** on **Arbitrum**.

---

## The problem

A *tanda* (ROSCA) is how millions of Mexicans save: N people each put in a fixed amount
every round, and each round one member takes the whole pot. It works on social trust — and
it breaks the moment someone takes their payout and stops contributing. There's no
underwriting, no collateral, no recourse.

## What Tanda does

- **AI underwriter** reads each member's *on-chain* reputation (rounds paid on time, late,
  defaults, circles completed) and assigns a credit score. The score sets the member's
  **collateral multiplier** and how early a payout slot they may bid for.
- **Trust-minimized AI.** The AI never has unchecked power. Every decision is **EIP-712
  signed** off-chain, and the `Underwriter` contract independently recomputes a deterministic
  `baseScore` from the soulbound reputation token and **rejects any signed score outside a
  ±15 band** around it. The AI can nuance, never fabricate.
- **Escrow + slash.** Contributions and collateral live in the `TandaCircle` contract. Miss a
  round and your collateral is slashed to make the recipient whole.
- **Insurance pool.** A shared pool absorbs shortfalls beyond a single member's collateral, so
  the receiving member is always paid in full.
- **Slot auction.** Members bid for earlier payout slots, but only within the risk band the AI
  allows — a low-score member literally cannot outbid into an early slot.

### The three money-shots

1. **Default caught** — a member skips their contribution; resolving the round slashes their
   collateral and the insurance pool tops up the recipient. Nobody loses.
2. **AI early-warning** — before the deadline, the agent flags an at-risk member (signed
   `RiskFlag`), and the dashboard surfaces it so the group can react.
3. **Auction band** — a low-score member's bid for an early slot is rejected on-chain because
   the AI-set band forbids it.

---

## Live on Arbitrum Sepolia

The full "Tanda Oaxaca" demo circle is deployed and seeded on **Arbitrum Sepolia** (chain
`421614`). All state on the dashboard is read live from these contracts:

| Contract | Address |
|---|---|
| Demo circle (Tanda Oaxaca) | [`0x4E96CA33C8fFd5Eb6f99d5D081e97FAF1E8a559B`](https://sepolia.arbiscan.io/address/0x4E96CA33C8fFd5Eb6f99d5D081e97FAF1E8a559B) |
| CircleFactory | [`0xFD53CE3B35660D8B8Dfa514DDB3853172A42C1E8`](https://sepolia.arbiscan.io/address/0xFD53CE3B35660D8B8Dfa514DDB3853172A42C1E8) |
| Underwriter | [`0x67f70c123B446fE87C51Eb78A1e64Ba3e1B2042D`](https://sepolia.arbiscan.io/address/0x67f70c123B446fE87C51Eb78A1e64Ba3e1B2042D) |
| ReputationSBT | [`0xC747777779e9f16d01e39be6C056BdD9F88C4055`](https://sepolia.arbiscan.io/address/0xC747777779e9f16d01e39be6C056BdD9F88C4055) |
| InsurancePool | [`0x5064dF1dEc4f929d5155D9c69d493B52285e5706`](https://sepolia.arbiscan.io/address/0x5064dF1dEc4f929d5155D9c69d493B52285e5706) |
| MockMXNB | [`0x7FeA15363F3Cc0B71DA8545C0ECb4b752e5F1F3e`](https://sepolia.arbiscan.io/address/0x7FeA15363F3Cc0B71DA8545C0ECb4b752e5F1F3e) |

The seeded circle has 4 members with real on-chain reputation: **María 82** (0.5× collateral),
**Diego 66** (1×), **Lupe 50** (2×), **0xkito 28** (3×, flagged at-risk).

---

## Architecture

```
contracts/   Solidity (Foundry, OZ v5) — the trust-minimized core
  MockMXNB         ERC-20 stand-in for Bitso's MXNB peso stablecoin
  ReputationSBT    soulbound (ERC-5192) per-member reputation counters
  Underwriter      deterministic baseScore + EIP-712 verify of signed AI scores/flags
  InsurancePool    shared pool that backstops defaults
  CircleFactory    deploys TandaCircle instances
  TandaCircle      escrow, join/contribute/payout/resolve, slash, bid/finalize

agent/       TypeScript — the AI underwriter
  scoring.ts       deterministic baseScore + collateral ladder (mirrors the contract)
  underwrite.ts    Claude (claude-opus-4-8) forced-JSON scoring, deterministic fallback
  monitor.ts       default-risk assessment for RiskFlags
  sign.ts          EIP-712 signing of Decision / RiskFlag (cross-layer pinned)
  runtime/         callable service used by the web API route

web/         Next.js 15 + wagmi/viem + RainbowKit + Tailwind
  app/             folk-modern landing + live circle dashboard + /api/underwrite
  lib/             chain switch (anvil | arbitrumSepolia), contract bindings, hooks
```

**Trust boundary.** The web `/api/underwrite` route reads the member's reputation, collateral
and contribution status **directly from the chain** (never from the client) before signing, so
a caller can't inflate their own score. Even if it tried, the `Underwriter` contract's ±15
band check is the backstop.

**Tech:** Solidity ^0.8.24 · Foundry · OpenZeppelin v5 · TypeScript · Next.js 15 · React 19 ·
wagmi v2 · viem v2 · RainbowKit · Tailwind. Tests: `77 forge + 20 vitest`, green.

---

## Quickstart — local anvil (fully offline)

```bash
# 0. build + test
cd contracts && forge build && forge test     # 77 passing
cd ../agent   && npm install && npx vitest run # 20 passing

# 1. local chain
anvil                                          # terminal 1

# 2. deploy + seed the demo circle (deterministic addresses)
cd contracts                                   # terminal 2
forge script script/SeedDemo.s.sol:SeedDemo --rpc-url http://127.0.0.1:8545 --broadcast

# 3. point the web app at anvil
cd ../web && cp .env.local.example .env.local  # NEXT_PUBLIC_CHAIN=anvil + the logged addresses
npm install && npm run dev                     # http://localhost:3000
```

Open `/circles/<DEMO_CIRCLE>` to see the live dashboard.

---

## Run against Arbitrum Sepolia

The deploy + seed runs as a single Foundry script. You supply your own funded deployer key —
the repo never holds a private key.

```powershell
# one command: deploy 5 contracts, seed reputation, fund members, create circle, run rounds
cd contracts
$env:PRIVATE_KEY="0x<your funded Arbitrum-Sepolia key>"
$env:ARBITRUM_SEPOLIA_RPC_URL="https://arb-sepolia.g.alchemy.com/v2/<key>"
forge script script/SeedDemoSepolia.s.sol:SeedDemoSepolia `
  --rpc-url $env:ARBITRUM_SEPOLIA_RPC_URL --broadcast --slow
```

Then copy the logged addresses into `web/.env.local` (see `web/.env.production.example`), set
`NEXT_PUBLIC_CHAIN=arbitrumSepolia`, and `npm run dev`.

**Two non-obvious gotchas, already handled in the script:**

- **`--slow` is required.** The deployer funds the member EOAs with gas in the same run; without
  `--slow`, a member's first tx can be sent before its funding tx confirms.
- **Members use fresh keccak-derived keys, not the public test mnemonic.** On public testnets,
  bots set EIP-7702 delegations on the well-known anvil accounts that instantly sweep any
  incoming ETH — so gas funding to those addresses never sticks. High-entropy project-specific
  keys are invisible to those sweepers.

The **AI signer** is the well-known test account #0 — it only *signs* EIP-712 digests, never
holds or receives ETH, so it needs no gas and stays identical across anvil and Sepolia.

---

## Gasless passkey onboarding (ERC-4337)

A new member can join with only a **device passkey** — no browser wallet, no ETH, no
pre-funded MXNB. One Pimlico-sponsored UserOperation batches `mint → approve → join`,
authorized by a WebAuthn passkey that owns a Coinbase Smart Account (pure `viem/account-abstraction`,
no permissionless.js). It's a progressive enhancement — the EOA/RainbowKit flow is untouched.

Setup:
1. Pimlico (`dashboard.pimlico.io`): an API key + a sponsorship policy covering Arbitrum Sepolia.
2. Create a Forming circle to onboard into:
   ```powershell
   $env:PRIVATE_KEY="0x..."; $env:FACTORY="0xFD53CE3B35660D8B8Dfa514DDB3853172A42C1E8"
   forge script script/CreateFormingCircleSepolia.s.sol:CreateFormingCircleSepolia `
     --rpc-url $env:ARBITRUM_SEPOLIA_RPC_URL --broadcast
   ```
3. In `web/.env.local`: `NEXT_PUBLIC_BUNDLER_URL` (Pimlico v2 URL), `NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY`,
   and `NEXT_PUBLIC_GASLESS_CIRCLE` (the address from step 2).

On that circle's dashboard (while it's still Forming) the **"Únete con passkey (sin gas)"** button
runs the sponsored join. Verified live: three passkey smart accounts joined a Forming circle paying
0 ETH, each AI-scored as a cold-start member (50 → 2× collateral).

---

## Demo script (the 1–3 min video)

1. **Open the dashboard** — Tanda Oaxaca, round 2 of 4, live from Arbitrum Sepolia (footer
   shows chain 421614). Four members, each with an **AI score** driving a different collateral
   multiplier (0.5× → 3×).
2. **AI early-warning** — point at the red banner: the agent has signed a `RiskFlag` for
   **0xkito**, who hasn't contributed this round. Their card is **FLAGGED**.
3. **Auction band** — the slot-auction row shows 0xkito's bid for an earlier slot **rejected
   on-chain** because their score is below the AI-permitted band.
4. **Default caught** — once round 2's deadline passes (~10 min after seeding; round duration
   is short on testnet), click **Resolver ronda**: 0xkito's collateral is slashed and the
   **insurance pool** keeps the recipient (Diego) whole. Show the pool balance before/after.

5. **Gasless onboarding** (bonus) — on a Forming circle, tap **"Únete con passkey (sin gas)"**,
   authenticate with Face ID / Windows Hello, and a brand-new smart account joins the tanda in
   one Pimlico-sponsored transaction: no wallet, no ETH, no MXNB up front.

Every number on screen is a live on-chain read — verifiable on
[Arbiscan](https://sepolia.arbiscan.io/address/0x4E96CA33C8fFd5Eb6f99d5D081e97FAF1E8a559B).

---

## Status

- ✅ Contracts + AI agent — complete, reviewed, tested (77 forge / 20 vitest)
- ✅ Web app — folk-modern landing + live dashboard + write flows
- ✅ Deployed + seeded live on Arbitrum Sepolia
- ✅ Gasless passkey onboarding (ERC-4337) — verified live: passkey-owned smart accounts
  join via Pimlico-sponsored userops (mint + approve + join batched, 0 ETH, no wallet)
