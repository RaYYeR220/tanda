# Tanda On-Chain — Design Spec

**Date:** 2026-05-31
**Status:** Approved (brainstorming → spec). Next: implementation plan.
**Context:** 2nd BUIDL for ETH Mexico 2026 (w/ Bitso) on DoraHacks. Submit by **2026-06-05 18:00**. Sibling build: "Anticipo" (separate). Judging: 30% code · 25% innovation · 20% real-world impact LATAM · 15% Ethereum/L2 stack · 10% demo. Real addressable cash = Arbitrum + ETH Mexico (General + Startups). Tech stack at builder's discretion.

---

## 1. One-liner

A rotating savings circle (ROSCA / Mexican **tanda**) on **Arbitrum**, denominated in **MXNB** (Bitso's MXN stablecoin), where an **AI underwriter** scores member reliability from on-chain reputation + wallet metadata and sets each member's **required collateral**, **auction bid band**, and **insurance premium** — with decisions **enforced on-chain and clamped to a verifiable band** around a contract-computed base score. Defaults are absorbed by slashing collateral + an insurance buffer. Onboarding is **gasless via account abstraction**.

**Product name:** Tanda. Tagline: *"La tanda de siempre — sin el riesgo de que te dejen colgado."*

## 2. Problem

Tandas are hugely popular across Mexico/LATAM: a group contributes a fixed amount each round and members take turns receiving the whole pot — a bankless, interest-free way to save and borrow. The flaw: it runs on **trust**. A member can take an early payout and stop contributing, leaving the rest short. There is no enforcement and no portable reputation.

## 3. Why this wins the rubric

- **Innovation (25%):** trust-minimized AI underwriting (decisions clamped to a verifiable on-chain band), auction-ordered payouts bounded by AI risk, continuous agentic monitoring with pre-default early-warning.
- **Impact LATAM (20%):** culturally specific (the tanda is a real Mexican institution), denominated in pesos (MXNB), gasless AA onboarding for the unbanked — dead-center on the sponsor's financial-inclusion mission.
- **Code (30%):** factory + escrow state machine + soulbound reputation + underwriter with EIP-712 + band enforcement + insurance pool + AI agent + AA + frontend = substantial, tested surface.
- **L2 stack (15%):** Arbitrum settlement, native MXNB stablecoin, ERC-4337 account abstraction + paymaster.
- **Demo (10%):** gasless join → AI scores w/ rationale + verifiable band → bid auction → AI early-warning → default caught, collateral+insurance absorb it, recipient made whole, vs a naive ROSCA that loses money.

## 4. Architecture overview

Monorepo:
- `/contracts` — Solidity (Foundry, OpenZeppelin), Arbitrum Sepolia.
- `/agent` — TypeScript AI underwriter (Anthropic SDK + viem).
- `/web` — Next.js frontend (wagmi/viem + RainbowKit + AA SDK + Tailwind/shadcn).
- `/scripts` — deploy + seed (incl. a "round 1" run that generates real on-chain reputation for the "round 2" demo).

### 4.1 Contracts

| Contract | Purpose |
|---|---|
| `MockMXNB` | ERC20 mock of the MXN stablecoin for testnet; mintable to demo wallets. |
| `CircleFactory` | Deploys/registers `TandaCircle` instances; holds global config (MXNB addr, SBT, InsurancePool, Underwriter); grants registered circles permission to write reputation; emits events for indexing. |
| `TandaCircle` | Escrow + state machine for one circle. States: `Forming → Bidding → Active(rounds) → Completed / Defaulted`. Functions: `join()` (locks AI-assigned collateral; gasless-compatible), `bid()` (auction for payout slot within AI's allowed band), `contribute()` (fixed per-round MXNB), `payout()` (slot winner receives the pot), `topUpCollateral()` (on monitoring demand), default path (slash collateral → draw insurance → downgrade reputation; recipient stays whole). Guards: ReentrancyGuard, checks-effects-interactions. Writes contribution timeliness to `ReputationSBT`. |
| `Underwriter` | Accepts an EIP-712-signed AI decision; computes the deterministic `baseScore` from on-chain reputation; enforces `|adjustedScore − baseScore| ≤ MAX_DELTA`; owns the fixed `score → collateral / premium / bid-band` mapping. The trust-minimization point: the AI nudges within a bounded coridor and cannot arbitrarily harm a member. Commits a hash of off-chain features + rationale. |
| `ReputationSBT` | ERC-5192 soulbound, cross-circle reputation per address: rounds participated, on-time/late counts, defaults, circles completed. Writable only by registered circles. Primary real AI signal. |
| `InsurancePool` | MXNB buffer; funded by per-circle premiums; covers shortfall beyond a defaulter's collateral. "LP yield" = accumulated premiums (no AMM). |

### 4.2 AI underwriter agent (trust-minimized)

- **Inputs (features per member):** SBT reputation (on-chain, verifiable: on-time ratio, defaults, circles completed) + wallet metadata fetched via RPC/explorer (wallet age = first-tx, tx count, MXNB balance).
- **Engine:** the contract computes the deterministic `baseScore` from on-chain reputation. The agent feeds `baseScore` + off-chain wallet features to **Claude (Anthropic SDK)**, which returns a **structured decision** (forced JSON schema) plus a human-readable **rationale**, EIP-712-signs it, and commits a hash of the inputs + rationale. The contract clamps the adjustment to `MAX_DELTA`.
- **Levers (enforced on-chain):** (1) required collateral, (2) auction bid band / max earliness per member, (3) admit / flag / require co-signer, (4) circle insurance premium.
- **Monitoring:** each round the agent re-scores members and issues an early-warning, and can require a collateral top-up before a predicted default.
- **Fallback:** if the LLM is unavailable, the system uses the pure on-chain `baseScore` — member funds never depend on the LLM.

### 4.3 Frontend

Landing (what a tanda is, the trust/default problem, how the AI fixes it) · circle dashboard (members with AI score, assigned collateral, rationale tooltip, reputation SBT; round progress; auction bid UI; insurance pool status; AI early-warning banner) · "create circle" → underwriting → AI decision shown before confirm · **gasless join** (no ETH) · default scenario visualizing slash → insurance → reputation hit.

### 4.4 Account abstraction

ERC-4337 smart accounts + paymaster (sponsor pays gas) so members onboard with no seed phrase and no ETH for gas — serving the unbanked-onboarding mission. Passkey/social login. EOA fallback retained. Exact AA library (Pimlico / ZeroDev / Alchemy Account Kit on Arbitrum Sepolia) to be confirmed at build start.

## 5. Data flow (one circle lifecycle)

1. Organizer creates a circle (amount, members, rounds, round duration) via `CircleFactory`.
2. AI agent scores each member → EIP-712-signed decision + feature/rationale commitment → `Underwriter` validates the band → collateral schedule + bid bands + premium set on the circle.
3. **Bidding:** members bid discounts for earlier payout slots, within their AI-allowed bands; surplus from discounts is redistributed.
4. **Join:** members join gasless, locking AI-assigned collateral; the circle routes the premium into `InsurancePool`.
5. **Rounds:** members `contribute()` MXNB; the slot winner receives the pot; `ReputationSBT` updated.
6. **Monitoring:** each round the agent re-scores → early-warning → may require `topUpCollateral()`.
7. **Default:** missed contribution after grace → slash collateral → draw insurance for any remainder → downgrade reputation; the recipient is still made whole.
8. **Completion:** collateral returned to clean members; reputation upgraded for clean completion; LPs earn the accumulated premium.

## 6. Demo (≤ 3 min)

(1) Gasless onboarding with no ETH/seed phrase → (2) AI scores members, showing the rationale + the verifiable band → (3) auction for an early slot → (4) AI issues a pre-default early-warning and requires a top-up → (5) the member defaults anyway → slash + insurance absorb it, the recipient is made whole, contrasted with a naive ROSCA that loses money. Seed script runs a prior "round 1" so round 2's scoring uses real on-chain reputation.

## 7. Error handling & edge cases

- Quorum not reached in `Forming` → cancel + refund.
- Grace period; late vs default distinction.
- Insurance pool insufficient → loss socialized / circle flagged — surfaced honestly, no "magic."
- AI unavailable → conservative deterministic `baseScore` fallback.
- Reentrancy guards on payout/slash; checks-effects-interactions; OpenZeppelin primitives.

## 8. Testing

- **Foundry** unit + invariant: contribution accounting, `payout == Σ contributions`, slash math, insurance draw, reputation updates, **Underwriter band enforcement**, EIP-712 verification, access control (only underwriter sets the schedule; only registered circles write reputation).
- **Agent:** unit-test the deterministic scorer; snapshot the structured-output schema; mock Anthropic for determinism.
- **AA:** test the gasless path.
- **Integration:** happy-path + default-path via Foundry script.

## 9. Build order (each phase leaves a demoable artifact)

1. **Core escrow:** `MockMXNB` + `TandaCircle` (contributions / rotation / payout) + `ReputationSBT` + `CircleFactory` + happy-path test/demo. ← minimal coherent submission.
2. **AI underwriter + `Underwriter` band:** scoring → collateral → on-chain enforcement + rationale in UI.
3. **Default path + `InsurancePool`:** slash → insurance, dashboard visualization.
4. **Auction payout ordering** (bidding).
5. **AA gasless onboarding.**
6. **Agentic monitoring / early-warning.**

Phases 1–3 already make a strong submission; 4–6 are the max-ambition layer. If time runs out at phase N, submit at N — the narrative stays whole.

## 10. Decisions locked

- Currency: **MXNB** (peso stablecoin), deployed as `MockMXNB` on testnet; contract is ERC20-agnostic.
- AI signals: **hybrid** — primary signal is protocol-recorded on-chain reputation (SBT) + wallet metadata; demo generates real reputation in a prior round; cold-start → higher default collateral.
- Scope: **fuller platform** (factory + SBT + insurance + auction + AA + monitoring), phased.
- Network: **Arbitrum Sepolia** (testnet; accepted for all prizes).
- Underwriter trust model: **trust-minimized** — contract-computed base score + EIP-712-signed AI decision clamped to a verifiable band (NOT blind trust of a privileged key).

## 11. Out of scope (YAGNI)

- Real Bitso API / fiat on-off-ramp integration (Bitso prizes are credits, not cash; dropped as a money target). Any fiat ramp is narrated, not integrated.
- Real off-chain legal enforceability of obligations.
- AMM / complex yield on the insurance pool (premiums-only).
- zkML / verifiable inference (band enforcement is the pragmatic trust-minimization instead).
- Mainnet deployment.
