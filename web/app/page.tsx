import Hero from "@/components/Hero";
import PapelPicado from "@/components/PapelPicado";
import SarapeStripe from "@/components/SarapeStripe";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";

const demoCircle = process.env.NEXT_PUBLIC_DEMO_CIRCLE ?? "#";

export default function Home() {
  return (
    <>
      {/* ── NAVIGATION ─────────────────────────────────────────── */}
      <nav
        className="sticky top-0 z-50 flex items-center justify-between px-14 h-16"
        style={{
          background: "#8B2500",
          borderBottom: "3px solid #D97706",
          animation: "fadeIn 0.4s ease forwards",
        }}
      >
        <a
          href="/"
          className="flex items-baseline gap-[10px] no-underline"
          aria-label="Tanda — home"
        >
          <span
            className="font-display text-[1.8rem] text-[#FAF3E0]"
            style={{ letterSpacing: "-0.01em", lineHeight: 1 }}
          >
            Tanda
          </span>
          <span
            className="text-[0.68rem] font-semibold tracking-[0.14em] uppercase"
            style={{ color: "#EDD9A3", opacity: 0.6 }}
          >
            On-Chain · MXNB
          </span>
        </a>

        <ul className="flex items-center gap-9 list-none m-0 p-0">
          <li>
            <a
              href="#como-funciona"
              className="text-[0.82rem] font-semibold tracking-[0.07em] uppercase no-underline transition-all duration-200"
              style={{ color: "#EDD9A3", opacity: 0.8 }}
            >
              Cómo funciona
            </a>
          </li>
          <li>
            <a
              href="#dashboard"
              className="text-[0.82rem] font-semibold tracking-[0.07em] uppercase no-underline transition-all duration-200"
              style={{ color: "#EDD9A3", opacity: 0.8 }}
            >
              Ver demo
            </a>
          </li>
          <li>
            <ConnectButton
              label="Conectar"
              showBalance={false}
              chainStatus="none"
              accountStatus="avatar"
            />
          </li>
          <li>
            <a
              href="#"
              className="text-[0.82rem] font-bold tracking-[0.04em] rounded-[4px] px-5 py-2 no-underline transition-all duration-200"
              style={{
                background: "#D97706",
                color: "#1C1410",
              }}
            >
              Crear tanda →
            </a>
          </li>
        </ul>
      </nav>

      {/* ── HERO ───────────────────────────────────────────────── */}
      <Hero />

      {/* ── DIVIDER: hero → cream ───────────────────────────────── */}
      <PapelPicado variant="divider" />

      {/* ── DASHBOARD TEASER ───────────────────────────────────── */}
      <section
        id="dashboard"
        className="relative overflow-hidden"
        style={{
          background: "#FAF3E0",
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E")`,
          padding: "80px 56px 110px",
        }}
        aria-label="Dashboard teaser"
      >
        {/* Decorative radial glows */}
        <div
          className="absolute pointer-events-none rounded-full"
          style={{
            top: -220, right: -220,
            width: 520, height: 520,
            background: "radial-gradient(circle, rgba(217,119,6,0.055) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute pointer-events-none rounded-full"
          style={{
            bottom: -180, left: -180,
            width: 440, height: 440,
            background: "radial-gradient(circle, rgba(13,110,110,0.055) 0%, transparent 70%)",
          }}
        />

        <div className="relative z-10 max-w-[1140px] mx-auto">
          {/* Section header */}
          <div className="text-center mb-14">
            <div
              className="inline-block text-[0.70rem] font-bold tracking-[0.18em] uppercase mb-3"
              style={{ color: "#C2410C" }}
            >
              Vista previa — Circle Dashboard
            </div>
            <h2
              className="font-display mb-3"
              style={{
                fontSize: "clamp(2.2rem, 3.5vw, 3.2rem)",
                color: "#1C1410",
                letterSpacing: "-0.02em",
                lineHeight: 1.08,
              }}
            >
              Tu tanda,{" "}
              <span style={{ color: "#C2410C" }}>viva en tiempo real</span>
            </h2>
            <p
              className="text-[1rem] max-w-[540px] mx-auto leading-[1.65]"
              style={{ color: "#6B4C33" }}
            >
              El agente de IA monitorea cada ronda, puntúa a cada miembro y
              detecta riesgos de impago antes de que ocurran — para que la
              receptora siempre cobre completo.
            </p>
          </div>

          {/* Dashboard preview card */}
          <div
            className="rounded-[14px] overflow-hidden"
            style={{
              background: "#1C1410",
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.038'/%3E%3C/svg%3E")`,
              boxShadow: "0 16px 56px rgba(28,20,16,0.22), 0 2px 10px rgba(28,20,16,0.12), 0 0 0 1px rgba(217,119,6,0.14)",
            }}
          >
            {/* Sarape stripe accent */}
            <SarapeStripe />

            {/* Browser chrome */}
            <div
              className="flex items-center gap-2 px-7 py-[14px]"
              style={{
                background: "rgba(28,20,16,0.55)",
                backdropFilter: "blur(4px)",
                borderBottom: "1px solid rgba(237,217,163,0.08)",
              }}
              aria-hidden="true"
            >
              <span className="w-[11px] h-[11px] rounded-full bg-[#FF5F57]" />
              <span className="w-[11px] h-[11px] rounded-full bg-[#FEBC2E]" />
              <span className="w-[11px] h-[11px] rounded-full bg-[#28C840]" />
              <span
                className="ml-4 text-[0.74rem] font-medium tracking-[0.04em]"
                style={{ color: "rgba(237,217,163,0.4)" }}
              >
                tanda.app / círculos / oaxaca-2025
              </span>
              <span
                className="ml-auto flex items-center gap-[6px] text-[0.70rem] font-bold tracking-[0.10em] uppercase"
                style={{ color: "#F59E0B" }}
              >
                <span
                  className="w-[7px] h-[7px] rounded-full"
                  style={{
                    background: "#F59E0B",
                    animation: "pulseGlow 1.6s ease-in-out infinite",
                  }}
                />
                Ronda activa
              </span>
            </div>

            {/* Card body */}
            <div className="p-8">
              <div
                className="text-center py-10"
                style={{ color: "rgba(237,217,163,0.6)" }}
              >
                <div
                  className="font-display text-[3rem] mb-4"
                  style={{ color: "#F59E0B" }}
                >
                  Tanda Oaxaca
                </div>
                <div className="text-[0.95rem] leading-relaxed mb-6">
                  Tanda activa · 4 miembros · Ronda 2 de 4 · Pote: 400 MXNB
                </div>
                <Link
                  href={demoCircle.startsWith("0x") ? `/circles/${demoCircle}` : "#"}
                  className="inline-flex items-center gap-2 font-bold text-[1.05rem] no-underline transition-all duration-200 hover:gap-3"
                  style={{ color: "#F59E0B" }}
                >
                  Ver tu tanda en vivo →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── DIVIDER: cream → ink ──────────────────────────────── */}
      <div
        style={{ background: "linear-gradient(180deg, #FAF3E0 0%, #1C1410 100%)" }}
        aria-hidden="true"
      >
        <PapelPicado />
      </div>

      {/* ── HOW IT WORKS (id anchor) ─────────────────────────── */}
      <section
        id="como-funciona"
        className="relative overflow-hidden"
        style={{
          background: "#1C1410",
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
          padding: "72px 56px 80px",
        }}
        aria-label="El mecanismo — default protection"
      >
        <div className="max-w-[1140px] mx-auto relative z-10">
          <div className="text-center mb-12">
            <div
              className="text-[0.70rem] font-bold tracking-[0.18em] uppercase mb-3"
              style={{ color: "#D97706" }}
            >
              Por qué importa — The mechanism
            </div>
            <h2
              className="font-display"
              style={{
                fontSize: "clamp(1.8rem, 3vw, 2.6rem)",
                color: "#FAF3E0",
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
              }}
            >
              El impago{" "}
              <span style={{ color: "#F59E0B" }}>no te detiene.</span>
              <br />
              Con o sin él, la receptora cobra.
            </h2>
          </div>

          {/* Comparison grid */}
          <div
            className="grid gap-6 items-center"
            style={{ gridTemplateColumns: "1fr auto 1fr" }}
          >
            {/* BAD */}
            <div
              className="rounded-[10px] p-7 relative overflow-hidden"
              style={{
                background: "rgba(220,38,38,0.06)",
                border: "1.5px solid rgba(220,38,38,0.28)",
              }}
            >
              <div
                className="absolute top-0 left-0 right-0 h-1"
                style={{ background: "linear-gradient(90deg, #991B1B, #DC2626)" }}
              />
              <div
                className="text-[0.68rem] font-extrabold tracking-[0.15em] uppercase mb-3"
                style={{ color: "#F87171" }}
              >
                ❌ Sin Tanda — ROSCA tradicional
              </div>
              <div
                className="font-display text-[1.15rem] mb-2 leading-[1.2] text-[#FAF3E0]"
              >
                0xkito deja de pagar esta ronda
              </div>
              <p
                className="text-[0.92rem] leading-[1.5] mb-4"
                style={{ color: "rgba(252,165,165,0.80)" }}
              >
                El grupo absorbe la pérdida. No hay colateral, no hay fondo de
                protección. La organizadora persigue al moroso. La receptora
                espera... o no cobra.
              </p>
              <div
                className="font-display text-[1.8rem] leading-none"
                style={{ color: "#F87171" }}
              >
                − 100 MXNB
              </div>
              <div
                className="text-[0.74rem] mt-1 font-medium"
                style={{ color: "rgba(252,165,165,0.55)" }}
              >
                El grupo pierde · Sin recurso
              </div>
            </div>

            {/* VS badge */}
            <div
              className="flex items-center justify-center w-[52px] h-[52px] rounded-full font-display text-[0.9rem] font-bold flex-shrink-0"
              style={{
                background: "#D97706",
                color: "#1C1410",
                boxShadow: "0 0 0 6px rgba(217,119,6,0.15), 0 4px 24px rgba(194,65,12,0.18)",
              }}
            >
              VS
            </div>

            {/* GOOD */}
            <div
              className="rounded-[10px] p-7 relative overflow-hidden"
              style={{
                background: "rgba(5,150,105,0.06)",
                border: "1.5px solid rgba(5,150,105,0.28)",
              }}
            >
              <div
                className="absolute top-0 left-0 right-0 h-1"
                style={{ background: "linear-gradient(90deg, #059669, #34D399)" }}
              />
              <div
                className="text-[0.68rem] font-extrabold tracking-[0.15em] uppercase mb-3"
                style={{ color: "#6EE7B7" }}
              >
                ✓ Con Tanda — Colateral + Fondo
              </div>
              <div
                className="font-display text-[1.15rem] mb-2 leading-[1.2] text-[#FAF3E0]"
              >
                0xkito detectado en riesgo antes de incumplir
              </div>
              <p
                className="text-[0.92rem] leading-[1.5] mb-4"
                style={{ color: "rgba(110,231,183,0.80)" }}
              >
                El agente activa la alerta. Se exige refuerzo de colateral. Si
                hay impago, los 300 MXNB bloqueados se ejecutan. El fondo cubre
                cualquier diferencia. María cobra completo.
              </p>
              <div
                className="font-display text-[1.8rem] leading-none"
                style={{ color: "#34D399" }}
              >
                400 MXNB ✓
              </div>
              <div
                className="text-[0.74rem] mt-1 font-medium"
                style={{ color: "rgba(52,211,153,0.55)" }}
              >
                La receptora cobra completo · Siempre
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER PAPEL PICADO ──────────────────────────────── */}
      <PapelPicado variant="footer" />

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer
        style={{ background: "#1C1410" }}
        aria-label="Site footer"
      >
        <div
          className="max-w-[1140px] mx-auto px-14 py-[52px] flex flex-wrap items-center justify-between gap-6"
        >
          <div>
            <div className="flex items-baseline gap-[10px]">
              <span
                className="font-display text-[2.2rem] text-[#FAF3E0]"
                style={{ letterSpacing: "-0.02em" }}
              >
                Tanda
              </span>
            </div>
            <p
              className="text-[0.82rem] italic mt-1"
              style={{ color: "#6B4C33" }}
            >
              La tanda de siempre — sin el riesgo de que te dejen colgado.
            </p>
          </div>
          <nav aria-label="Footer navigation">
            <ul className="flex flex-wrap gap-8 list-none m-0 p-0">
              {["Cómo funciona", "Arbitrum", "MXNB", "Seguridad", "Términos", "@tanda_onchain"].map(
                (link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-[0.76rem] font-semibold tracking-[0.10em] uppercase no-underline transition-colors duration-200"
                      style={{ color: "#6B4C33" }}
                    >
                      {link}
                    </a>
                  </li>
                )
              )}
            </ul>
          </nav>
        </div>
        <div
          className="h-px mx-14"
          style={{ background: "rgba(237,217,163,0.08)" }}
        />
        <div
          className="px-14 py-5 flex flex-wrap items-center justify-between gap-2"
        >
          <span
            className="text-[0.72rem] tracking-[0.05em]"
            style={{ color: "rgba(107,76,51,0.55)" }}
          >
            © 2025 Tanda On-Chain. No somos custodios de tus fondos.
          </span>
          <div
            className="flex items-center gap-2 text-[0.70rem] font-semibold tracking-[0.10em] uppercase"
            style={{ color: "rgba(237,217,163,0.30)" }}
          >
            <span className="w-[5px] h-[5px] rounded-full" style={{ background: "#0F9090" }} />
            Built on Arbitrum
            <span className="w-[5px] h-[5px] rounded-full" style={{ background: "#0F9090" }} />
            Settles in MXNB
            <span className="w-[5px] h-[5px] rounded-full" style={{ background: "#0F9090" }} />
            Non-custodial
          </div>
        </div>
      </footer>
    </>
  );
}
