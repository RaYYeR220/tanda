# Tanda Phase 7 — Frontend (Next.js) + Live-Chain Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Tanda web app — a Next.js frontend matching the locked design (`web/variants/v-FINAL.html`: Mexican folk-modern) that reads and writes a REAL chain. It renders the landing page and a live circle dashboard ("Tanda Oaxaca") driven by on-chain state from the Phase-1–6 contracts, with the AI underwriter agent producing the EIP-712-signed scores/flags. Built and tested against a local **anvil** node; one env var flips it to **Arbitrum Sepolia** for the demo recording.

**Architecture:** Next.js (App Router) + TypeScript + wagmi/viem + RainbowKit + Tailwind, in `web/` (the existing `web/variants/` mockups stay as design reference). A shared `web/lib/contracts.ts` holds addresses (from env) + ABIs (exported from Foundry). The dashboard reads circle state via viem `readContract`/`multicall` and renders the folk-modern UI. A small **agent runtime** (`agent/src/runtime/`) wires the existing `scoring.ts`/`underwrite.ts`/`sign.ts`/`monitor.ts` into a callable service the frontend (or a seed script) uses to obtain signed decisions/flags. A deterministic **seed script** (`contracts/script/SeedDemo.s.sol` + an orchestration script) stands up the full "Tanda Oaxaca" demo state on anvil: deploy → create circle → members join with AI-signed scores → run round 1 (generating real reputation) → leave round 2 mid-flight with an at-risk member flagged, so the dashboard shows the money-shot live.

**Tech Stack:** Next.js 15 (App Router) + React 19 + TypeScript; wagmi v2 + viem v2 + RainbowKit; Tailwind CSS v3; the existing `agent/` TS package; Foundry (anvil + forge) for the local chain and seeding. AA (Phase 5, gasless via passkey/paymaster) is layered in Task 8 as a progressive enhancement.

---

## Design system source of truth
`web/variants/v-FINAL.html` is the locked visual. Extract its tokens verbatim into Tailwind/CSS variables:
- **Palette:** terracotta/cochineal red, marigold/cempasúchil gold, teal/indigo accent, warm cream/bone, dark folk ink (dashboard). Trust-state colors: high=green, mid=amber, low=neutral, flagged=red.
- **Fonts:** display = Yeseva One (or Fraunces); body = Hanken Grotesk (or Mulish). Via `next/font/google`.
- **Signature:** CSS papel-picado banner component; sarape stripe accents; paper grain texture; staggered load motion.
Recreate these as real React components — do NOT iframe the HTML.

---

## File Structure

```
web/
  package.json, next.config.mjs, tsconfig.json, tailwind.config.ts, postcss.config.mjs, .env.local.example
  app/
    layout.tsx            # fonts, providers, grain overlay
    globals.css           # tokens, papel-picado, sarape, grain utilities
    page.tsx              # landing (hero + features + trust strip)
    circles/[address]/page.tsx   # live circle dashboard
    providers.tsx         # wagmi + RainbowKit + QueryClient
  components/
    PapelPicado.tsx, SarapeStripe.tsx, GrainOverlay.tsx
    Hero.tsx, FeatureCard.tsx, TrustStrip.tsx
    CircleHeader.tsx, MemberCard.tsx, AiWarningBanner.tsx, AuctionRow.tsx, InsurancePoolCard.tsx
    ScoreRing.tsx         # AI score numeric + colored bar/ring
  lib/
    contracts.ts          # addresses (env) + typed ABIs
    abis.ts               # ABIs exported from Foundry out/
    chain.ts              # anvil | arbitrumSepolia switch via env
    useCircle.ts          # hook: read circle state (members, scores, collateral, round, atRisk, pool)
    format.ts             # MXNB (6dp) + score + multiplier formatting
  scripts/
    export-abis.mjs       # copy/é ABIs from ../contracts/out into lib/abis.ts

agent/
  src/runtime/
    service.ts            # assemble features -> underwrite -> sign Decision / RiskFlag; returns signed payloads
    index.ts              # tiny HTTP shim OR a callable used by the seed script
contracts/
  script/
    SeedDemo.s.sol        # forge script: deploy + create "Tanda Oaxaca" + seed round-1 reputation
  (a JS orchestrator under web/scripts or agent/ ties signed AI decisions into the seed)
```

> NOTE on signing in the seed: `SeedDemo.s.sol` cannot call the TS agent. Two clean options — pick the simpler at build time: (A) the Solidity seed uses the test `SignDecision` pattern inlined (a known anvil key as `aiSigner`) to self-sign decisions; (B) a JS orchestrator (viem + the agent's `signDecision`) does deploy+seed entirely off Foundry. **Default to (A)** for the deploy/seed (deterministic, no cross-process), and use the TS agent live in the frontend "create circle" / "flag" flows. Document whichever is used.

---

## Task 1: Export ABIs + scaffold Next.js app

**Files:** `web/package.json`, `next.config.mjs`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`, `web/scripts/export-abis.mjs`, `web/lib/abis.ts`, `web/lib/chain.ts`, `web/lib/contracts.ts`, `.env.local.example`

- [ ] **Step 1: Build contract artifacts**

```bash
cd contracts && forge build
```
Expected: `out/` contains `MockMXNB.sol/MockMXNB.json`, `ReputationSBT.sol/...`, `Underwriter.sol/...`, `InsurancePool.sol/...`, `CircleFactory.sol/...`, `TandaCircle.sol/...`.

- [ ] **Step 2: Scaffold Next.js (non-interactive) in `web/`**

The `web/` dir already exists (holds `variants/`). Scaffold into it without clobbering `variants/`:

```bash
cd web && npm init -y && npm install next@15 react@19 react-dom@19 wagmi viem @rainbow-me/rainbowkit @tanstack/react-query && npm install -D typescript @types/react @types/node tailwindcss@3 postcss autoprefixer
```

Then create `next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = { reactStrictMode: true };
export default nextConfig;
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "lib": ["dom", "dom.iterable", "ES2022"], "allowJs": true,
    "skipLibCheck": true, "strict": true, "noEmit": true, "esModuleInterop": true,
    "module": "esnext", "moduleResolution": "bundler", "resolveJsonModule": true,
    "isolatedModules": true, "jsx": "preserve", "incremental": true,
    "plugins": [{ "name": "next" }], "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "variants"]
}
```
Add to `package.json` scripts: `"dev": "next dev", "build": "next build", "start": "next start"`.

- [ ] **Step 3: Tailwind config with the locked tokens**

`tailwind.config.ts`:
```ts
import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        terracotta: "#B23A1E", cochineal: "#9E2A2B", marigold: "#E8A317",
        cempasuchil: "#F2820D", teal: "#2A7F7A", indigo: "#3B3A8C",
        cream: "#F7F0E1", bone: "#EFE6D2", ink: "#241712",
        trust: { high: "#3E8E5A", mid: "#E8A317", low: "#8A8170", flag: "#C2362B" },
      },
      fontFamily: { display: ["var(--font-display)"], body: ["var(--font-body)"] },
    },
  },
  plugins: [],
} satisfies Config;
```
`postcss.config.mjs`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 4: ABI export script**

`web/scripts/export-abis.mjs` — read each contract JSON from `../contracts/out` and write a typed `web/lib/abis.ts` exporting `const X_ABI = [...] as const` for MockMXNB, ReputationSBT, Underwriter, InsurancePool, CircleFactory, TandaCircle:
```js
import { readFileSync, writeFileSync } from "node:fs";
const names = ["MockMXNB","ReputationSBT","Underwriter","InsurancePool","CircleFactory","TandaCircle"];
const out = names.map((n) => {
  const j = JSON.parse(readFileSync(`../contracts/out/${n}.sol/${n}.json`, "utf8"));
  return `export const ${n}_ABI = ${JSON.stringify(j.abi)} as const;`;
}).join("\n\n");
writeFileSync("lib/abis.ts", out + "\n");
console.log("wrote lib/abis.ts");
```
Run: `cd web && node scripts/export-abis.mjs`. Expected: `lib/abis.ts` created.

- [ ] **Step 5: chain + contracts config**

`web/lib/chain.ts`:
```ts
import { defineChain } from "viem";
import { arbitrumSepolia } from "viem/chains";

export const anvil = defineChain({
  id: 31337, name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

export const activeChain = process.env.NEXT_PUBLIC_CHAIN === "arbitrumSepolia" ? arbitrumSepolia : anvil;
```

`web/lib/contracts.ts`:
```ts
import { MockMXNB_ABI, ReputationSBT_ABI, Underwriter_ABI, InsurancePool_ABI, CircleFactory_ABI, TandaCircle_ABI } from "./abis";

export const addresses = {
  mxnb: process.env.NEXT_PUBLIC_MXNB as `0x${string}`,
  reputation: process.env.NEXT_PUBLIC_REPUTATION as `0x${string}`,
  underwriter: process.env.NEXT_PUBLIC_UNDERWRITER as `0x${string}`,
  insurancePool: process.env.NEXT_PUBLIC_INSURANCE as `0x${string}`,
  factory: process.env.NEXT_PUBLIC_FACTORY as `0x${string}`,
  demoCircle: process.env.NEXT_PUBLIC_DEMO_CIRCLE as `0x${string}`,
};
export const abis = { MockMXNB_ABI, ReputationSBT_ABI, Underwriter_ABI, InsurancePool_ABI, CircleFactory_ABI, TandaCircle_ABI };
```

`.env.local.example`:
```
NEXT_PUBLIC_CHAIN=anvil
NEXT_PUBLIC_WALLETCONNECT_ID=demo
NEXT_PUBLIC_MXNB=0x...
NEXT_PUBLIC_REPUTATION=0x...
NEXT_PUBLIC_UNDERWRITER=0x...
NEXT_PUBLIC_INSURANCE=0x...
NEXT_PUBLIC_FACTORY=0x...
NEXT_PUBLIC_DEMO_CIRCLE=0x...
```

- [ ] **Step 6: Verify it builds (empty app shell)**

Create a placeholder `app/layout.tsx` + `app/page.tsx` returning "Tanda", then:
```bash
cd web && npm run build
```
Expected: Next build succeeds. Add `web/node_modules`, `web/.next` to root `.gitignore` if not already covered (`node_modules/` and `web/.next/` are).

- [ ] **Step 7: Commit**

```bash
git add web/package.json web/next.config.mjs web/tsconfig.json web/tailwind.config.ts web/postcss.config.mjs web/scripts/export-abis.mjs web/lib web/app .gitignore web/.env.local.example
git commit -m "feat(web): scaffold Next.js app + ABI export + chain/contracts config"
```

---

## Task 2: Design-system primitives (folk-modern)

**Files:** `web/app/globals.css`, `web/app/layout.tsx`, `web/components/{PapelPicado,SarapeStripe,GrainOverlay}.tsx`

Recreate the locked visual primitives from `v-FINAL.html` as React/CSS. Reference that file for exact look.

- [ ] **Step 1: globals.css** — Tailwind layers + CSS variables for the palette, the `--font-display`/`--font-body` hooks, a paper-grain background utility (SVG noise data-uri or layered radial gradients), a `.papel-picado` banner (CSS scalloped/perforated triangles in the palette), a `.sarape` repeating-gradient stripe utility, and a `staggered-fade` keyframe (used with `animation-delay`).

- [ ] **Step 2: layout.tsx** — load Yeseva One (display) + Hanken Grotesk (body) via `next/font/google`, set the CSS vars, wrap children in `<Providers>` (Task 3) and render `<GrainOverlay/>` + a top `<PapelPicado/>`.

- [ ] **Step 3: components** — `PapelPicado` (decorative banner, accepts a color array), `SarapeStripe` (thin woven stripe divider), `GrainOverlay` (fixed grain layer). Each a small focused file.

- [ ] **Step 4: Visual check** — `npm run dev`, screenshot `/` at 1440px (via the playwright/run tooling), confirm grain + papel-picado + fonts render and match `v-FINAL` hero styling. Iterate until it matches.

- [ ] **Step 5: Commit** `feat(web): folk-modern design-system primitives (papel picado, sarape, grain, fonts)`

---

## Task 3: wagmi/RainbowKit providers + landing page

**Files:** `web/app/providers.tsx`, `web/app/page.tsx`, `web/components/{Hero,FeatureCard,TrustStrip}.tsx`

- [ ] **Step 1: providers.tsx** — `WagmiProvider` (config with `activeChain`, injected + walletconnect connectors), `QueryClientProvider`, `RainbowKitProvider` (themed to terracotta). Client component.

- [ ] **Step 2: Hero + landing** — build `app/page.tsx` = `<Hero/>` (serif headline "La tanda de siempre. / Sin el riesgo." with marigold accent, value prop, the circle-emblem visual with member nodes, 3 `<FeatureCard/>`, primary/secondary CTAs, `<TrustStrip/>`), matching `v-FINAL`. Connect-wallet button (RainbowKit) in the header. The "Crear una tanda" CTA links to the dashboard for now.

- [ ] **Step 2b: Visual check** — dev server, screenshot `/`, compare to `v-FINAL` hero. Iterate to match the locked design.

- [ ] **Step 3: Commit** `feat(web): wallet providers + folk-modern landing page`

---

## Task 4: Deploy + seed the demo circle on anvil

**Files:** `contracts/script/SeedDemo.s.sol`, plus a documented run recipe; outputs addresses into `web/.env.local`

Stand up the full "Tanda Oaxaca" demo state on a local anvil so the dashboard has real on-chain data.

- [ ] **Step 1: Write `SeedDemo.s.sol`** — a forge script that, using a known anvil key as the AI signer (self-signing decisions inline via the `SignDecision` digest pattern, since a script can't call the TS agent): deploys MockMXNB/ReputationSBT/Underwriter/InsurancePool/CircleFactory (reusing `Deploy` logic); mints MXNB to 4 demo members (anvil accounts); creates "Tanda Oaxaca" (100 MXNB, 4 members, round/bid durations); has each member `join` with an AI-signed score (María 82, Diego 66, Lupe 50, 0xkito 28 — clamped within band, so seed each member's reputation first to make those base scores reachable); runs **round 1** fully (all contribute → payout) to generate real on-chain reputation; advances into **round 2**, has María/Diego/Lupe contribute, leaves 0xkito un-paid, and posts an AI `flagAtRisk(0xkito)` — so the live dashboard shows exactly the money-shot state. `console2.log` all addresses.

- [ ] **Step 2: Run recipe** (documented in `web/README.md`):
```bash
# terminal 1
anvil
# terminal 2
cd contracts && forge script script/SeedDemo.s.sol:SeedDemo --rpc-url http://127.0.0.1:8545 --broadcast --unlocked
# copy the logged addresses into web/.env.local (NEXT_PUBLIC_* incl. DEMO_CIRCLE)
```
Expected: clean run, logs all 5 infra addresses + the demo circle address + member addresses.

- [ ] **Step 3: Sanity read** — a quick `cast call <demoCircle> "memberCount()(uint256)"` returns 4, `state()` is Active, round is 1 (0-indexed). Confirm reputation scores are non-trivial (round 1 recorded on-time).

- [ ] **Step 4: Commit** `feat(contracts): SeedDemo script — full Tanda Oaxaca demo state for the frontend`

---

## Task 5: Live circle dashboard

**Files:** `web/app/circles/[address]/page.tsx`, `web/lib/useCircle.ts`, `web/lib/format.ts`, `web/components/{CircleHeader,MemberCard,ScoreRing,AiWarningBanner,AuctionRow,InsurancePoolCard}.tsx`

Render the locked dashboard from real chain reads.

- [ ] **Step 1: format.ts** — `formatMXNB(bigint)` (6dp, thousands), `formatScore`, `collateralMultiplier(collateralWei, contributionWei)` → "0.5×"/"1×"/"2×"/"3×", `trustTier(score)` → high/mid/low/flag.

- [ ] **Step 2: useCircle.ts** — a hook using viem `multicall`/`readContracts` against the circle + reputation + pool: reads `members`, per-member `collateral`, `memberScore`, `reputation(addr)`, `hasDefaulted`, `atRisk(currentRound, addr)`, `currentRound`, `contributionAmount`, `payoutOrderAt`, plus pool `balance()`. Returns a typed `Circle` view model. Reads `addresses.demoCircle` by default.

- [ ] **Step 3: components** — `ScoreRing` (numeric score + colored bar/ring by tier), `MemberCard` (avatar/initial, name/handle from a small address→name map for the demo, score ring, collateral ×, slot, AI rationale caption, trust-state color border, FLAGGED badge if atRisk/hasDefaulted), `CircleHeader` (pote, ronda, contribución, próxima receptora via payoutOrder, fondo), `AiWarningBanner` (shown when any member is `atRisk` — names them, on-brand alert), `AuctionRow` (the tanda-de-puja explainer + the blocked-bid line), `InsurancePoolCard` (pool balance). Match `v-FINAL` exactly.

- [ ] **Step 4: page.tsx** — `circles/[address]/page.tsx` composes them from `useCircle`. Default route `/circles/<demoCircle>` renders the seeded Tanda Oaxaca. Handle loading/empty states.

- [ ] **Step 5: Visual + data check** — with anvil + seed running and `.env.local` set, `npm run dev`, screenshot the dashboard. Confirm: 4 members with real scores (82/66/50/28-ish from the seed), 0xkito flagged, AI warning banner present, pool balance real, próxima receptora correct. Compare to `v-FINAL`. Iterate.

- [ ] **Step 6: Commit** `feat(web): live circle dashboard reading real on-chain state`

---

## Task 6: Agent runtime service (live signed decisions)

**Files:** `agent/src/runtime/service.ts`, `agent/src/runtime/index.ts`, `agent/test/service.test.ts`

Wire the existing `scoring`/`underwrite`/`sign`/`monitor`/`features` modules into a callable service the frontend uses for the live "create circle" and "flag" flows (and that could replace the seed's inline signing later).

- [ ] **Step 1: Write a failing test** `agent/test/service.test.ts` for `buildSignedDecision(member, reputation, walletMeta, circle, deadline, signerKey)` → returns `{ adjustedScore, rationaleHash, deadline, signature }` whose signer recovers to the key's address (reuse the viem recover pattern). And `buildSignedRiskFlag(...)` similarly.

- [ ] **Step 2: Implement `service.ts`** composing `assessScore` (deterministic baseScore + optional Claude `underwrite`) → `signDecision`; and `assessDefaultRisk` → `signRiskFlag`. Pure functions taking an account/key (no network needed for signing).

- [ ] **Step 3: Run** `cd agent && npx vitest run service` → PASS.

- [ ] **Step 4: index.ts** — a tiny local HTTP endpoint (or a Next.js route handler under `web/app/api/underwrite/route.ts` importing the agent package) that the frontend calls to get a signed decision for a joining member / a risk flag. Keep it minimal; the API key for Claude is read from env, with the deterministic fallback when absent.

- [ ] **Step 5: Commit** `feat(agent): runtime service for live signed decisions + risk flags`

---

## Task 7: "Create a circle" + "Contribute" live write flows

**Files:** `web/app/circles/new/page.tsx`, write hooks in `web/lib/`, wire buttons

Make the app actually transact against the chain (the live-chain requirement).

- [ ] **Step 1: Create-circle flow** — a form (amount, members, durations) → calls `factory.createCircle` via wagmi `useWriteContract`; on success routes to the new circle. For each joining member in the demo, the frontend fetches a signed decision from the agent route (Task 6) and calls `join(...)`.

- [ ] **Step 2: Contribute / resolve / top-up buttons** on the dashboard — `contribute()`, `topUpCollateral()`, and (after deadline) `resolveRound()` wired to wagmi writes, with tx toasts and optimistic refetch via the `useCircle` query. The "default caught" money-shot becomes clickable live: warp not possible on a public chain, so for anvil use an `evm_increaseTime` helper documented for the demo; on Sepolia use a short round duration.

- [ ] **Step 3: Visual + flow check** — exercise create → join → contribute → resolve on anvil; screenshot each state. Confirm the dashboard updates from chain.

- [ ] **Step 4: Commit** `feat(web): live create-circle, contribute, top-up, resolve flows`

---

## Task 8: Account abstraction — gasless onboarding (Phase 5, progressive enhancement)

**Files:** `web/lib/aa.ts`, provider wiring, a "Join with passkey" path

Layer ERC-4337 gasless onboarding as an enhancement over the working EOA flow (don't regress the EOA path).

- [ ] **Step 1: Choose + install the AA stack** — confirm a viem-compatible AA SDK that supports Arbitrum Sepolia + a paymaster (e.g. Permissionless.js + Pimlico, or ZeroDev). Add a passkey/social signer.
- [ ] **Step 2: `aa.ts`** — create a smart account + a paymaster-sponsored client; expose `joinGasless(circle, signedDecision)` that sends the `join` userop with sponsored gas.
- [ ] **Step 3: UI** — a "Únete con passkey (sin gas)" button on join; fall back to the normal connector if AA is unavailable. Narrate it in the hero ("gasless onboarding").
- [ ] **Step 4: Check** — on Sepolia (or the AA SDK's local setup), a passkey join with zero ETH in the account succeeds via the paymaster. Screenshot.
- [ ] **Step 5: Commit** `feat(web): ERC-4337 gasless passkey onboarding (progressive enhancement)`

> If AA integration proves too time-expensive near the deadline, ship Tasks 1–7 (a complete live-chain app) and narrate AA as designed-but-pluggable. AA is the one stretch piece.

---

## Task 9: Arbitrum Sepolia deploy + demo polish

**Files:** `web/README.md`, `web/.env.production.example`

- [ ] **Step 1: User-run testnet deploy** — document the exact commands for the USER to run with their own funded test key (the assistant never handles the private key):
```bash
# user runs in their shell via the ! prefix:
! cd contracts && forge script script/Deploy.s.sol:Deploy --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --broadcast --private-key $PRIVATE_KEY
```
Then a Sepolia variant of the seed (short round duration). Copy addresses into `web/.env.local` with `NEXT_PUBLIC_CHAIN=arbitrumSepolia`.
- [ ] **Step 2: Smoke test** the deployed app against Sepolia; screenshot landing + dashboard reading real testnet state.
- [ ] **Step 3: README** — quickstart (anvil + seed + dev), the Sepolia recipe, and the demo script (the 3 money-shots to show on camera). 
- [ ] **Step 4: Commit** `docs(web): README quickstart + Sepolia deploy recipe + demo script`

---

## Phase 7 Done — Definition of Done

- [ ] `cd web && npm run build` succeeds; `npm run dev` serves the landing + dashboard.
- [ ] Against local anvil + `SeedDemo`, the dashboard renders the real "Tanda Oaxaca" on-chain state (4 members, real AI scores, 0xkito flagged, AI warning banner, real insurance-pool balance, correct próxima receptora) and visually matches `v-FINAL.html`.
- [ ] Live write flows work on anvil: create circle, join (with agent-signed decision), contribute, top-up, resolve — dashboard updates from chain.
- [ ] One env var (`NEXT_PUBLIC_CHAIN`) + the user's testnet deploy flips the app to Arbitrum Sepolia.
- [ ] (Stretch) gasless passkey join works via a paymaster.
- [ ] All prior contract/agent tests still green (77 forge + 17 vitest + any new service tests).

**Next:** record the 1–3 min demo video (the 3 money-shots), finalize the DoraHacks submission (GitHub + video) before June 5 18:00.

---

## Self-Review

**Spec coverage (design spec §4.3 frontend + §4.4 AA + live-chain requirement):** ✔ Next.js app matching the locked folk-modern design (Tasks 1-3,5), ✔ live on-chain reads driving the dashboard (Task 5) and live writes (Task 7) — the user's "живой чейн" choice, ✔ landing + dashboard built together (Tasks 3+5) — the user's order choice, ✔ AI agent runtime producing signed decisions/flags consumed by the app (Task 6), ✔ seeded demo state generating real round-1 reputation for the round-2 money-shot (Task 4), ✔ AA gasless onboarding as a layered enhancement (Task 8) — folds in deferred Phase 5, ✔ Arbitrum Sepolia switch + user-run deploy (Task 9). The three money-shots (default caught, AI early-warning, auction band) all surface in the dashboard (Task 5) and are exercisable live (Task 7).

**Placeholder scan:** No TBD/TODO in shipped code paths. The seed-signing approach has a documented A/B decision (default A: inline anvil-key signing) — resolved, not a placeholder. The AA SDK choice is left to build-time confirmation (Task 8 Step 1) because it depends on current Sepolia paymaster availability — flagged as the one stretch piece with an explicit fallback.

**Type/consistency:** ABIs are exported from the SAME Foundry `out/` the contracts compile to (Task 1), so the frontend's contract calls track the real on-chain interface — no hand-maintained ABI drift. The EIP-712 domain/structs the agent runtime signs (Task 6) reuse the exact `agent/src/sign.ts` constants already cross-layer-pinned in Phases 2/6, so frontend-obtained signatures are accepted by the deployed `Underwriter`. `useCircle` reads exactly the public getters that exist on `TandaCircle`/`ReputationSBT`/`InsurancePool` (members, collateral, memberScore, reputation, hasDefaulted, atRisk, currentRound, contributionAmount, payoutOrderAt, balance). Trust-tier thresholds in `format.ts` mirror the on-chain ladder bands (≥80/≥60/≥40/<40) for visual consistency with the contract's collateral/premium tiers.
