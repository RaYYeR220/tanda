import Link from "next/link";
import FeatureCard from "./FeatureCard";
import TrustStrip from "./TrustStrip";

const features = [
  {
    icon: "🤖",
    title: "Puntaje IA de confianza",
    body: "An AI underwriter reads your on-chain history and sets the collateral you must stake — no bank needed. Low-risk members put up less; high-risk members put up more.",
    accentColor: "#D97706",
    iconBg: "rgba(217,119,6,0.18)",
  },
  {
    icon: "🔒",
    title: "A prueba de impagos",
    body: "If someone defaults, their staked collateral is slashed and an insurance pool covers any shortfall. The recipient always gets paid in full. Always.",
    accentColor: "#0F9090",
    iconBg: "rgba(13,110,110,0.18)",
  },
  {
    icon: "📲",
    title: "Onboarding sin fricción",
    body: "Join with a passkey — no seed phrase, no gas, no exchange account. Built for the next wave of LATAM users, including the unbanked.",
    accentColor: "#A78BFA",
    iconBg: "rgba(167,139,250,0.18)",
  },
];

export default function Hero() {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        background: "#8B2500",
        backgroundImage: `
          url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.055'/%3E%3C/svg%3E"),
          radial-gradient(ellipse 75% 55% at 28% 38%, rgba(217,119,6,0.22) 0%, transparent 70%),
          radial-gradient(ellipse 55% 70% at 88% 18%, rgba(13,110,110,0.18) 0%, transparent 60%)
        `,
      }}
      aria-label="Hero"
    >
      {/* Decorative folk mandala circles */}
      <svg
        className="absolute pointer-events-none"
        style={{ right: -80, top: -100, width: 580, height: 580 }}
        aria-hidden="true"
        viewBox="0 0 580 580"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="290" cy="290" r="280" stroke="rgba(245,158,11,0.09)" strokeWidth="1.5" />
        <circle cx="290" cy="290" r="248" stroke="rgba(245,158,11,0.07)" strokeWidth="1" />
        <circle cx="290" cy="290" r="210" stroke="rgba(13,110,110,0.08)" strokeWidth="1.5" />
        <circle cx="290" cy="290" r="172" stroke="rgba(245,158,11,0.06)" strokeWidth="1" />
        <circle cx="290" cy="290" r="130" stroke="rgba(194,65,12,0.10)" strokeWidth="2" />
        <circle cx="290" cy="290" r="80"  stroke="rgba(245,158,11,0.08)" strokeWidth="1" />
        <line x1="10"  y1="290" x2="570" y2="290" stroke="rgba(245,158,11,0.05)" strokeWidth="0.75" />
        <line x1="290" y1="10"  x2="290" y2="570" stroke="rgba(245,158,11,0.05)" strokeWidth="0.75" />
        <line x1="85"  y1="85"  x2="495" y2="495" stroke="rgba(245,158,11,0.04)" strokeWidth="0.75" />
        <line x1="495" y1="85"  x2="85"  y2="495" stroke="rgba(245,158,11,0.04)" strokeWidth="0.75" />
      </svg>

      {/* Folk rosette bottom-left */}
      <svg
        className="absolute pointer-events-none"
        style={{ left: -70, bottom: -70, width: 340, height: 340, opacity: 0.055 }}
        aria-hidden="true"
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="100" cy="100" r="90"  stroke="white" strokeWidth="1.5" />
        <circle cx="100" cy="100" r="68"  stroke="white" strokeWidth="1" />
        <circle cx="100" cy="100" r="46"  stroke="white" strokeWidth="1.5" />
        <circle cx="100" cy="100" r="26"  stroke="white" strokeWidth="1" />
        <line x1="10"  y1="100" x2="190" y2="100" stroke="white" strokeWidth="0.6" />
        <line x1="100" y1="10"  x2="100" y2="190" stroke="white" strokeWidth="0.6" />
        <line x1="29"  y1="29"  x2="171" y2="171" stroke="white" strokeWidth="0.6" />
        <line x1="171" y1="29"  x2="29"  y2="171" stroke="white" strokeWidth="0.6" />
      </svg>

      {/* Content grid */}
      <div
        className="relative z-10 max-w-[1240px] mx-auto px-14 grid items-center gap-[72px]"
        style={{
          paddingTop: 80,
          paddingBottom: 104,
          gridTemplateColumns: "1fr 1fr",
        }}
      >
        {/* LEFT: Copy */}
        <div>
          {/* Eyebrow badge */}
          <div
            className="reveal inline-flex items-center gap-2 mb-7 text-[0.71rem] font-bold tracking-[0.15em] uppercase rounded-[2px] px-3 py-[5px]"
            style={{
              background: "rgba(245,158,11,0.13)",
              border: "1px solid rgba(245,158,11,0.32)",
              color: "#F59E0B",
              animationDelay: "0.08s",
            }}
          >
            <span
              className="w-[6px] h-[6px] rounded-full flex-shrink-0"
              style={{
                background: "#F59E0B",
                animation: "pulseGlow 2s ease-in-out infinite",
              }}
            />
            Arbitrum · MXNB · Non-custodial
          </div>

          {/* Headline */}
          <h1
            className="reveal font-display mb-5"
            style={{
              fontSize: "clamp(3.2rem, 5.5vw, 5.2rem)",
              lineHeight: 1.0,
              color: "#FAF3E0",
              letterSpacing: "-0.02em",
              animationDelay: "0.18s",
            }}
          >
            La tanda
            <br />
            <span
              style={{
                display: "block",
                background: "linear-gradient(120deg, #D97706 0%, #F59E0B 40%, #FBBF24 60%, #D97706 100%)",
                backgroundSize: "250% auto",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                animation: "shimmerGold 4s linear infinite",
              }}
            >
              de siempre.
            </span>
            Sin el riesgo.
          </h1>

          {/* Spanish quote */}
          <p
            className="reveal text-[1.15rem] italic leading-[1.55] mb-3"
            style={{
              color: "#EDD9A3",
              borderLeft: "3px solid #D97706",
              paddingLeft: 18,
              animationDelay: "0.28s",
            }}
          >
            &ldquo;La tanda que siempre conociste — sin el riesgo de que te dejen colgado.&rdquo;
          </p>

          {/* English value prop */}
          <p
            className="reveal text-[0.93rem] leading-[1.65] mb-11 pl-5"
            style={{
              color: "rgba(250,243,224,0.68)",
              animationDelay: "0.28s",
            }}
          >
            AI-organized savings circles on-chain. Save together, in pesos, without the trust problem. Your money is protected by smart contracts and an AI underwriter — not by handshakes.
          </p>

          {/* Feature cards */}
          <div
            className="reveal flex flex-col gap-[13px] mb-11"
            style={{ animationDelay: "0.38s" }}
          >
            {features.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </div>

          {/* CTAs */}
          <div
            className="reveal flex flex-wrap gap-[14px] mb-11"
            style={{ animationDelay: "0.50s" }}
          >
            <Link href="/circles/new" className="btn-primary">
              🌼&nbsp; Crear una tanda
            </Link>
            <a href="#como-funciona" className="btn-secondary">
              Cómo funciona →
            </a>
          </div>

          {/* Trust strip */}
          <div
            className="reveal"
            style={{ animationDelay: "0.62s" }}
          >
            <TrustStrip />
          </div>
        </div>

        {/* RIGHT: Folk circle emblem */}
        <div
          className="reveal flex items-center justify-center"
          style={{ animationDelay: "0.28s" }}
          aria-hidden="true"
        >
          <div className="relative" style={{ width: 420, height: 420, flexShrink: 0 }}>
            {/* Outer sarape ring (conic-gradient via inline style) */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                border: "18px solid transparent",
                borderImage: "conic-gradient(#C2410C 0deg 45deg, #D97706 45deg 90deg, #0D6E6E 90deg 135deg, #7C3AED 135deg 180deg, #8B2500 180deg 225deg, #F59E0B 225deg 270deg, #0F9090 270deg 315deg, #C2410C 315deg 360deg) 20",
              }}
            />
            {/* Inner gold ring */}
            <div
              className="absolute rounded-full"
              style={{
                inset: 26,
                border: "5px solid rgba(245,158,11,0.12)",
              }}
            />
            {/* Inner teal/terracotta ring */}
            <div
              className="absolute rounded-full"
              style={{
                inset: 40,
                border: "3px solid transparent",
                borderImage: "conic-gradient(#0D6E6E 0deg 90deg, #C2410C 90deg 180deg, #D97706 180deg 270deg, #0D6E6E 270deg 360deg) 3",
              }}
            />

            {/* Member nodes */}
            {/* María — top, green/82 */}
            <div
              className="absolute flex items-center justify-center font-display text-[1.15rem] font-bold text-[#FAF3E0] rounded-full"
              style={{
                width: 54, height: 54,
                top: 14, left: "50%",
                transform: "translateX(-50%)",
                background: "#059669",
                border: "3px solid rgba(28,20,16,0.9)",
                zIndex: 4,
              }}
            >
              M
              <span
                className="absolute font-body text-[0.55rem] font-extrabold rounded-[8px] px-1"
                style={{
                  bottom: -5, right: -3,
                  background: "#1C1410",
                  color: "#34D399",
                  letterSpacing: "0.03em",
                  whiteSpace: "nowrap",
                }}
              >
                82
              </span>
            </div>

            {/* Diego — right, gold/66 */}
            <div
              className="absolute flex items-center justify-center font-display text-[1.15rem] font-bold text-[#FAF3E0] rounded-full"
              style={{
                width: 54, height: 54,
                right: 14, top: "50%",
                transform: "translateY(-50%)",
                background: "#D97706",
                border: "3px solid rgba(28,20,16,0.9)",
                zIndex: 4,
              }}
            >
              D
              <span
                className="absolute font-body text-[0.55rem] font-extrabold rounded-[8px] px-1"
                style={{
                  bottom: -5, right: -3,
                  background: "#1C1410",
                  color: "#F59E0B",
                  letterSpacing: "0.03em",
                  whiteSpace: "nowrap",
                }}
              >
                66
              </span>
            </div>

            {/* Lupe — bottom, teal/50 */}
            <div
              className="absolute flex items-center justify-center font-display text-[1.15rem] font-bold text-[#FAF3E0] rounded-full"
              style={{
                width: 54, height: 54,
                bottom: 14, left: "50%",
                transform: "translateX(-50%)",
                background: "#0D6E6E",
                border: "3px solid rgba(28,20,16,0.9)",
                zIndex: 4,
              }}
            >
              L
              <span
                className="absolute font-body text-[0.55rem] font-extrabold rounded-[8px] px-1"
                style={{
                  bottom: -5, right: -3,
                  background: "#1C1410",
                  color: "#F59E0B",
                  letterSpacing: "0.03em",
                  whiteSpace: "nowrap",
                }}
              >
                50
              </span>
            </div>

            {/* 0xkito — left, red/28 */}
            <div
              className="absolute flex items-center justify-center font-display text-[1.15rem] font-bold text-[#FAF3E0] rounded-full"
              style={{
                width: 54, height: 54,
                left: 14, top: "50%",
                transform: "translateY(-50%)",
                background: "#DC2626",
                border: "3px solid rgba(28,20,16,0.9)",
                zIndex: 4,
              }}
            >
              K
              <span
                className="absolute font-body text-[0.55rem] font-extrabold rounded-[8px] px-1"
                style={{
                  bottom: -5, right: -3,
                  background: "#1C1410",
                  color: "#FCA5A5",
                  letterSpacing: "0.03em",
                  whiteSpace: "nowrap",
                }}
              >
                28
              </span>
            </div>

            {/* Center emblem */}
            <div
              className="absolute flex flex-col items-center justify-center overflow-hidden rounded-full"
              style={{
                inset: 54,
                background: "rgba(28,20,16,0.90)",
                border: "1px solid rgba(237,217,163,0.10)",
              }}
            >
              {/* Subtle horizontal line pattern */}
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: `repeating-linear-gradient(0deg,
                    transparent 0, transparent 8px,
                    rgba(245,158,11,0.04) 8px, rgba(245,158,11,0.04) 9px
                  )`,
                }}
              />
              <div
                className="relative z-10 font-display text-[3.4rem] text-[#FAF3E0] leading-none"
                style={{ letterSpacing: "-0.03em" }}
              >
                T<span style={{ color: "#F59E0B" }}>a</span>nda
              </div>
              <div
                className="relative z-10 text-[0.65rem] font-bold tracking-[0.22em] uppercase mt-1"
                style={{ color: "rgba(237,217,163,0.35)" }}
              >
                On-Chain · MXNB
              </div>
              <div
                className="relative z-10 font-body italic text-[0.78rem] mt-2"
                style={{ color: "rgba(237,217,163,0.45)" }}
              >
                Tejida juntos · Woven together
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
