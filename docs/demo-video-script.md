# Tanda — Demo Video Script (~2:15)

> ETH Mexico 2026 · DoraHacks submission. Screen recording + ElevenLabs voiceover.
> Production server (clean, no dev overlays): `http://localhost:3010`
> (restart with `cd web && npx next start -p 3010`).

## Language
Voiceover in **English** (international judges); the app UI stays Spanish (built for the
Mexican market). Swap to a Spanish VO via ElevenLabs Multilingual if preferred.

---

## 0. Pre-flight checklist

- **Server:** `http://localhost:3010` (production build).
- **Browser:** fresh Chrome, hide bookmarks (`Ctrl+Shift+B`), 100% zoom, ~1280–1440px wide, then `F11` full-screen.
- **Open these tabs:**
  - Landing: `http://localhost:3010/`
  - Main circle: `http://localhost:3010/circles/0x4E96CA33C8fFd5Eb6f99d5D081e97FAF1E8a559B`
  - Auction: `http://localhost:3010/circles/0x5654b0104A4a7083FDd8ee59895CCeC6BF1f9CFF`
  - Gasless (forming): `http://localhost:3010/circles/0xDD01119D792d9E3c6520Fe29F37F4492b05B0875`
- **Recorder:** OBS / Win+G / ShareX — browser window only, 1080p+, 30–60 fps. Move the cursor slowly.
- **Two live actions need prep:**
  - *Resolver ronda* (default-caught): connect MetaMask with a little Sepolia ETH. ONE-SHOT — re-seed via `SeedDemoSepolia` for another take.
  - *Passkey gasless*: Windows Hello set up. One passkey per browser (cached in localStorage); for a clean "empty circle → first member" shot, create a fresh forming circle (command at the bottom).
- **Record each segment as its own clip**, then assemble. Cut/​speed up the on-chain waits.

---

## 1. Shot list

| # | Time | Screen / action | Recording notes |
|---|---|---|---|
| Title | 0:00–0:02 | Card: Tanda logo + "La tanda de siempre. Sin el riesgo." | Made in the editor |
| S1 | 0:02–0:18 | Landing: slow scroll through hero → "how it works" | One smooth top→down scroll, ~12s |
| S2 | 0:18–0:40 | Main circle: full dashboard → zoom on the 4 member cards (82/66/50/28, collateral 0.5×→3×) → cursor on footer "Arbitrum Sepolia · 421614" | Ken Burns zoom on cards + footer |
| S3 | 0:40–1:12 | Same circle: zoom on red AI banner (0xkito flagged) → click "Resolver ronda" → wait for confirm → dashboard updates (kito defaulted, pool/recipient) | Film click + result; cut/speed the tx wait |
| S4 | 1:12–1:36 | Auction circle: zoom on "TANDA DE PUJA (EN VIVO)" → hold on 0xkito row (80 MXNB, score 28, slot #3) + red "IA bloqueó" banner | Zoom on the bid table; linger on kito + banner |
| S5 | 1:36–2:00 | Gasless forming circle: cursor on "🔑 Únete con passkey" → click → Windows Hello prompt → "Te uniste sin gas" success panel | Film click + Hello + result; speed up the ~20s userop |
| End | 2:00–2:15 | Back to dashboard → end card: `github.com/RaYYeR220/tanda` + "ETH Mexico 2026 · MXNB · Arbitrum" | End card in the editor |

---

## 2. Voiceover (paste into ElevenLabs, one block)

**[S1 — ~16s]**
A tanda is how millions of Mexicans save together: everyone pays in each round, and the pot rotates to one person at a time. It runs on trust — and it breaks the moment someone takes their payout and stops paying. Tanda makes it trust-minimized, on-chain, in MXNB.

**[S2 — ~22s]**
This circle is live on Arbitrum Sepolia — every figure here is read straight from the chain. An AI underwriter scores each member from their on-chain history, and that score sets their collateral. María, score eighty-two, locks just half. A risky wallet — zero-x-kito, score twenty-eight — locks triple. The contract holds it all in escrow.

**[S3 — ~30s]**
Before a payment is even missed, the AI flags zero-x-kito as a default risk — signed on-chain. And when the round resolves, the contract acts: kito's collateral is slashed, the insurance pool covers the gap, and the recipient is paid in full. Nobody loses their savings. And the AI can't go rogue — every decision is signed and clamped on-chain to a safe band around a score the contract computes itself.

**[S4 — ~22s]**
Who gets paid first? Members bid for earlier turns — but the AI sets a risk band. Watch: zero-x-kito bids the most, eighty pesos, for an early slot. Blocked. A score of twenty-eight can't buy its way to the front — it lands last in line. The AI protects everyone else's money.

**[S5 — ~20s]**
And anyone can join with just a passkey. No wallet, no ETH, no gas. One sponsored transaction mints, approves, and joins — secured by a fingerprint. Account abstraction puts a first-time user one tap away from a real on-chain savings circle.

**[S6 — ~13s]**
Tanda — the savings circle Mexicans already trust, now without the risk. AI underwriting, on-chain escrow, an insurance backstop. All in MXNB, on Arbitrum.

---

## 3. ElevenLabs settings
- Model: Eleven Multilingual v2/v3 (handles "María", "MXNB").
- Voice: warm, trustworthy (Adam/Antoni/Daniel or Rachel/Matilda); a light Latin accent fits.
- Stability ~50%, Similarity ~75%, Style 0–20%, speed slightly slow.
- Names written phonetically ("zero-x-kito", "eighty-two") so it doesn't read "0x" as "ox". Fix by ear if needed.

---

## 4. Editing (CapCut or DaVinci Resolve)
1. Tracks: VO on top, video clips below, music third.
2. Lay each clip under its VO segment; speed up dead time (tx waits) ×4–×8 or jump-cut.
3. Ken Burns zoom-ins on: score cards (S2), AI banner (S3), bid table + "bloqueó" banner (S4), success panel (S5). Numbers must be readable.
4. Optional lower-thirds: "Live on Arbitrum Sepolia"; "Score 82 → 0.5× · Score 28 → 3×"; "Default caught — insurance keeps the recipient whole"; "Top bid blocked by the AI risk band"; "Gasless — no wallet, no ETH".
5. Music: warm/light (marimba/latin vibe), −18…−22 dB under VO. Pixabay / YouTube Audio Library.
6. Title card (0:00, 2s): dark #1C1410, "Tanda" (Yeseva One), tagline. End card (3s): GitHub URL + "ETH Mexico 2026 · MXNB · Arbitrum".
7. Export: MP4 H.264, 1080p, 30 fps, ~8–12 Mbps, ≤ 3:00.

---

## Fresh empty gasless circle (for a clean S5)
```powershell
$env:PRIVATE_KEY="0x<key>"; $env:FACTORY="0xFD53CE3B35660D8B8Dfa514DDB3853172A42C1E8"
$env:ARBITRUM_SEPOLIA_RPC_URL="https://<rpc>"
cd contracts
forge script script/CreateFormingCircleSepolia.s.sol:CreateFormingCircleSepolia `
  --rpc-url $env:ARBITRUM_SEPOLIA_RPC_URL --broadcast
```
Then record S5 on `http://localhost:3010/circles/<new address>`.
