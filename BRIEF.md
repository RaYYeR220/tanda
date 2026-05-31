# Tanda On-Chain — AI-organized savings circle (2nd BUIDL @ ETH Mexico 2026)

**Status:** CONFIRMED 2026-05-25 as the **2nd BUIDL for Ethereum Mexico 2026** (alongside the primary "Anticipo" invoice-factoring). See `ethmexico-bitso/BRIEF.md` for shared contest facts (dates, prizes, judging, submission mechanics). Tech stack at Claude's discretion. Not started; separate build session.
**Origin:** Brainstormed as alternative #5 during the ETH Mexico redesign; user loved it and chose to run it as a 2nd entry (low-competition field → two BUIDLs = two shots at the same Arbitrum + ETH Mexico pool, not dilution).
**Deadline:** submit by 2026-06-05 18:00 (same as Anticipo).

## One-liner (plain)
Народная мексиканская касса взаимопомощи (**«tanda»** / ROSCA), оцифрованная на блокчейне, с ИИ, который оценивает надёжность участников и снижает риск кидалова.

## Problem
Tandas (rotating savings & credit associations) are hugely popular in Mexico/LATAM: a group contributes a fixed amount each round, and members take turns receiving the whole pot — a bankless way to save and get an interest-free "loan." The flaw: it runs on **trust**. A member can take an early payout and stop contributing, leaving the rest short.

## Concept
- A circle of members each deposit a fixed **USDC** amount per round on **Arbitrum**; the pot rotates to one member per round (order by schedule / need / auction).
- A **smart contract escrows** contributions and automates payouts — removes the organizer's custody risk (no human holds the money).
- **AI agent is the load-bearing part:** scores member reliability (on-chain contribution history / reputation / required stake), flags default risk, can require collateral from riskier members, and optimizes payout ordering to minimize loss.
- **Defaults handled on-chain** (forfeited stake / collateral / a small insurance buffer priced in).

## Why it's strong (esp. for ETH Mexico)
- Sponsor = **Mexican non-profit** whose mission is onboarding the next wave of LATAM users → financial inclusion for the unbanked is dead-center on-mission (the 20% "real-world impact LATAM" criterion).
- **High originality** — culturally specific, few competitors will build it → innovation (25%).
- Many small contributions/payouts = a genuine "why a cheap L2" story → Arbitrum stack (15%).
- **Crisp demo:** circle forms → contributions → rotating payout → a default gets caught and handled.

## Key risk
The AI must be **genuinely load-bearing** (real reliability scoring from demonstrable on-chain signals), not a cosmetic label. Without that it degrades to "just an on-chain ROSCA." Design the scoring around concrete signals before building.

## Build feasibility
Solo + AI, ~1–3 days plausible: one pool/escrow contract (contributions + rotating payout + stake/collateral + default handling) + an AI scoring agent + a simple frontend + a demo. User's read: "звучит достаточно несложно."

## Targets (shares the ETH Mexico pool with Anticipo)
Applies to Arbitrum (General + Startups) + ETH Mexico (General + Startups) as a distinct BUIDL — "up to 10 bounties per BUIDL." Real cash pool = $3,480 (Bitso = credits, skip; SuperRare = off-theme NFT, skip). Startups-track eligibility for a solo builder still to confirm via Q&A.

## Next steps (separate build session)
- [ ] Design the AI reliability-scoring signal set (the load-bearing piece — on-chain contribution history / reputation / required stake).
- [ ] Spec contracts (contribution / rotation / stake / default) → plan → build.
- [ ] Demo: circle forms → contributions → rotating payout → a default caught & handled; 1–3 min video. Submit before June 5 18:00.
