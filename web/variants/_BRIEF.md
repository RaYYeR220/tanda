# Tanda — shared design brief for variant mockups

You are producing ONE self-contained HTML mockup (a **landing/hero section** immediately followed by a **circle-dashboard preview** section) for **Tanda**. Read this brief for the product facts and content, then execute your assigned aesthetic direction with total commitment. Your output is a single `.html` file with all CSS inline in a `<style>` tag (and minimal JS only if needed). Load fonts via Google Fonts `<link>`. No build step. Must render standalone in a browser at 1440px wide (and degrade gracefully narrower).

## What Tanda is (the product)
A **tanda** is the traditional Mexican rotating savings circle (ROSCA): a group each contributes a fixed amount every round, and members take turns receiving the whole pot — a bankless way to save and get an interest-free "loan." The flaw: it runs on trust — someone can take an early payout and stop paying.

**Tanda On-Chain** fixes that: it's a tanda on **Arbitrum**, denominated in **MXNB** (Mexican-peso stablecoin), where an **AI underwriter** scores each member's reliability from on-chain reputation, sets the **collateral** they must stake and their **payout-order eligibility**, and **monitors every round to warn of defaults before they happen**. A smart contract escrows funds; if someone defaults, their collateral is slashed and an **insurance pool** tops up the shortfall so the recipient is still paid in full. No organizer holds the money.

Audience: LATAM users, including the unbanked. Tone should feel **trustworthy with money** but also **culturally rooted** (this is a Mexican institution, in pesos) — not a cold generic crypto dapp.

## Required content — LANDING / HERO
- Product name **Tanda** (you may add a wordmark treatment) + a short Spanish-leaning tagline. Suggested: *"La tanda de siempre — sin el riesgo de que te dejen colgado."* (the savings circle you know, without the risk of getting left hanging) — translate/adapt freely, Spanish or bilingual.
- One-line value prop in English or bilingual: "AI-organized savings circles on-chain. Save together, in pesos, without the trust problem."
- 3 short feature points: **AI reliability scoring** (collateral set by an AI underwriter from on-chain history), **Default-proof** (collateral slash + insurance pool keep the recipient whole), **Gasless onboarding** (join with a passkey, no seed phrase, no gas — for the next wave of LATAM users).
- A primary CTA button: "Crear una tanda" / "Start a circle" and a secondary "Cómo funciona" / "How it works".
- A small trust strip: "Built on Arbitrum · Settles in MXNB · Non-custodial".

## Required content — CIRCLE DASHBOARD PREVIEW (below the hero, same page)
A mock of one active circle named **"Tanda Oaxaca"**, 100 MXNB per round, 4 members, round 2 of 4. Show:
- A pot/round header: "Pote: 400 MXNB" · "Ronda 2 de 4" · next recipient.
- A **members list/grid** of 4 members, each with: a name/handle (e.g. *María*, *Diego*, *Lupe*, *0xkito*), an **AI reliability score** (0–100, e.g. 82, 66, 50, 28), the **collateral** the AI assigned (e.g. 0.5×, 1×, 2×, 3× of 100 MXNB), their **payout slot**, and a tiny **AI rationale** tooltip/caption (e.g. "6 on-time rounds, 1 completed circle" or "new wallet, cold-start"). Visually distinguish a **high-trust** member from a **flagged / at-risk** member.
- One **AI early-warning banner**: e.g. "⚠ El agente detectó riesgo de impago de *0xkito* esta ronda — se solicitó refuerzo de colateral." (AI detected default risk; collateral top-up requested.)
- A small **insurance pool** indicator (e.g. "Fondo de protección: 1,240 MXNB").

The AI is the differentiator — make the **AI scoring + the early-warning** visually central and legible, not buried.

## Hard rules (from the design skill)
- **NO generic AI-slop aesthetics.** Forbidden: Inter, Roboto, Arial, system-ui as the display face; purple-gradient-on-white; cookie-cutter SaaS card layouts; Space Grotesk (overused — do not use it).
- Commit FULLY to your assigned direction. Distinctive display font + refined body font, both via Google Fonts. Cohesive CSS-variable palette. Atmosphere/texture/depth, not flat solid fills. One memorable signature element. Thoughtful page-load motion (staggered reveals via CSS animation-delay are fine).
- Real, legible, production-grade layout — not lorem-ipsum gray boxes. Use the real content above.
- Match code complexity to the vision (maximalist → elaborate; minimal → precise restraint).

## Output
Write exactly one file to the path you are given. Self-contained. Make it unforgettable in YOUR assigned direction.
