"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useCircle } from "@/lib/useCircle";
import { formatMXNB } from "@/lib/format";
import { getMemberInfo } from "@/lib/memberMap";
import { addresses } from "@/lib/contracts";
import { activeChain } from "@/lib/chain";
import PasskeyJoinButton from "@/components/PasskeyJoinButton";
import {
  useApprove,
  useContribute,
  useTopUp,
  useResolveRound,
  useFlagAtRisk,
} from "@/lib/useWriteTanda";
import CircleHeader from "@/components/CircleHeader";
import AiWarningBanner from "@/components/AiWarningBanner";
import MemberCard from "@/components/MemberCard";
import AuctionRow from "@/components/AuctionRow";
import InsurancePoolCard from "@/components/InsurancePoolCard";
import { TxToastProvider, useTxToast } from "@/components/TxToast";

const ANIM_DELAYS = ["0.12s", "0.22s", "0.32s", "0.42s"];

// Inner component that uses the toast context (must be inside TxToastProvider)
function CircleDashboard({ circleAddress }: { circleAddress: `0x${string}` }) {
  const view = useCircle(circleAddress);
  const { address: connectedAddress } = useAccount();
  const toast = useTxToast();

  // Track toast IDs across approve → action chains
  const toastIdRef = useRef<string | null>(null);

  // ── Refetch helper ───────────────────────────────────────
  const refetch = useCallback(() => {
    view.refetch().catch(console.error);
  }, [view]);

  // ── Contribute flow ──────────────────────────────────────
  const contribute = useContribute(circleAddress, () => {
    if (toastIdRef.current) {
      toast.update(toastIdRef.current, { status: "success", action: "Contribución confirmada ✓" });
    }
    refetch();
  });

  const approveContribute = useApprove(
    addresses.mxnb,
    circleAddress,
    useCallback(() => {
      // approval confirmed → trigger contribute
      if (toastIdRef.current) {
        toast.update(toastIdRef.current, { status: "confirming", action: "Contribuyendo…" });
      }
      contribute.run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contribute.run, toast]),
  );

  // Watch approve hash to update toast
  useEffect(() => {
    if (approveContribute.hash && toastIdRef.current) {
      toast.update(toastIdRef.current, { hash: approveContribute.hash });
    }
  }, [approveContribute.hash, toast]);

  const handleContribute = useCallback(() => {
    const id = toast.push({ action: "Aprobando MXNB…", status: "pending" });
    toastIdRef.current = id;
    approveContribute.run(view.contributionAmount);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast, approveContribute.run, view.contributionAmount]);

  // ── Top-up flow ──────────────────────────────────────────
  const [topUpAmount, setTopUpAmount] = useState<bigint>(0n);

  const topUp = useTopUp(circleAddress, () => {
    if (toastIdRef.current) {
      toast.update(toastIdRef.current, { status: "success", action: "Colateral reforzado ✓" });
    }
    refetch();
  });

  const approveTopUp = useApprove(
    addresses.mxnb,
    circleAddress,
    useCallback(() => {
      if (toastIdRef.current) {
        toast.update(toastIdRef.current, { status: "confirming", action: "Reforzando colateral…" });
      }
      topUp.run(topUpAmount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [topUp.run, topUpAmount, toast]),
  );

  const handleTopUp = useCallback(
    (amount: bigint) => {
      setTopUpAmount(amount);
      const id = toast.push({ action: "Aprobando MXNB para colateral…", status: "pending" });
      toastIdRef.current = id;
      approveTopUp.run(amount);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toast, approveTopUp.run],
  );

  // ── Resolve round ────────────────────────────────────────
  const resolveRound = useResolveRound(circleAddress, () => {
    if (toastIdRef.current) {
      toast.update(toastIdRef.current, { status: "success", action: "Ronda resuelta ✓" });
    }
    refetch();
  });

  // Watch resolveRound errors
  useEffect(() => {
    if (resolveRound.error && toastIdRef.current) {
      toast.update(toastIdRef.current, {
        status: "error",
        error: resolveRound.error.includes("RoundNotExpired")
          ? "La ronda aún no ha expirado"
          : resolveRound.error.slice(0, 120),
      });
    }
  }, [resolveRound.error, toast]);

  const handleResolveRound = useCallback(() => {
    const id = toast.push({ action: "Resolviendo ronda…", status: "pending" });
    toastIdRef.current = id;
    resolveRound.run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast, resolveRound.run]);

  // ── AI Flag ──────────────────────────────────────────────
  const flagAtRisk = useFlagAtRisk(circleAddress, () => {
    if (toastIdRef.current) {
      toast.update(toastIdRef.current, { status: "success", action: "Miembro marcado en riesgo ✓" });
    }
    refetch();
  });

  const handleFlagAtRisk = useCallback(
    async (member: `0x${string}`) => {
      const id = toast.push({ action: "Consultando agente IA…", status: "pending" });
      toastIdRef.current = id;
      try {
        await flagAtRisk.run(member);
        toast.update(id, { status: "confirming", action: "Enviando flag on-chain…" });
      } catch (e) {
        toast.update(id, { status: "error", error: String(e) });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toast, flagAtRisk.run],
  );

  const nextName = view.nextRecipient
    ? getMemberInfo(view.nextRecipient).name
    : "—";

  /* ── Loading state ── */
  if (view.loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#1C1410" }}
      >
        <div className="text-center">
          <div
            className="sarape-stripe mx-auto mb-6"
            style={{ width: 120, height: 5 }}
          />
          <p
            className="text-[0.8rem] font-bold tracking-[0.15em] uppercase"
            style={{ color: "rgba(237,217,163,0.45)" }}
          >
            Cargando círculo…
          </p>
        </div>
      </div>
    );
  }

  /* ── Error state ── */
  if (view.error) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#1C1410" }}
      >
        <div
          className="max-w-md mx-auto p-8 rounded-lg"
          style={{
            background: "rgba(220,38,38,0.09)",
            border: "1px solid rgba(220,38,38,0.28)",
          }}
        >
          <p
            className="text-[0.75rem] font-bold tracking-[0.15em] uppercase mb-2"
            style={{ color: "#F87171" }}
          >
            Error al cargar el círculo
          </p>
          <p className="text-[0.85rem]" style={{ color: "rgba(250,243,224,0.7)" }}>
            {view.error}
          </p>
          <Link
            href="/"
            className="inline-block mt-4 text-[0.75rem] font-bold tracking-[0.1em] uppercase"
            style={{ color: "#D97706" }}
          >
            ← Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  const isContributing =
    approveContribute.isPending ||
    approveContribute.isConfirming ||
    contribute.isPending ||
    contribute.isConfirming;

  const isToppingUp =
    approveTopUp.isPending ||
    approveTopUp.isConfirming ||
    topUp.isPending ||
    topUp.isConfirming;

  return (
    <div
      className="min-h-screen"
      style={{
        background: "#1C1410",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
      }}
    >
      {/* Sarape stripe at very top */}
      <div className="sarape-stripe" />

      {/* Top nav bar */}
      <nav
        className="flex items-center justify-between px-14 h-16"
        style={{
          background: "rgba(28,20,16,0.80)",
          borderBottom: "1px solid rgba(237,217,163,0.09)",
          backdropFilter: "blur(8px)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <Link
          href="/"
          className="flex items-baseline gap-2 no-underline"
          style={{ textDecoration: "none" }}
        >
          <span
            className="font-display text-[1.5rem]"
            style={{ color: "#FAF3E0", lineHeight: 1 }}
          >
            Tanda
          </span>
          <span
            className="text-[0.65rem] font-bold tracking-[0.14em] uppercase"
            style={{ color: "rgba(237,217,163,0.5)" }}
          >
            On-Chain · MXNB
          </span>
        </Link>

        <Link
          href="/"
          className="text-[0.78rem] font-semibold tracking-[0.06em]"
          style={{ color: "rgba(237,217,163,0.55)" }}
        >
          ← Volver al inicio
        </Link>
      </nav>

      {/* Main content */}
      <main className="max-w-[1240px] mx-auto px-8 py-12">

        {/* Section eyebrow */}
        <div className="mb-8">
          <div
            className="text-[0.65rem] font-bold tracking-[0.18em] uppercase mb-2"
            style={{ color: "#D97706" }}
          >
            Círculo activo — Dashboard en vivo
          </div>
          <h1
            className="font-display mb-2"
            style={{
              fontSize: "clamp(1.6rem, 3vw, 2.4rem)",
              color: "#FAF3E0",
              letterSpacing: "-0.01em",
              lineHeight: 1.1,
            }}
          >
            Tanda Oaxaca{" "}
            <span style={{ color: "#F59E0B" }}>· Tiempo real</span>
          </h1>
          <p
            className="text-[0.88rem]"
            style={{ color: "rgba(237,217,163,0.45)", maxWidth: 560 }}
          >
            El agente IA monitorea cada ronda, puntúa a los miembros y detecta
            riesgos antes de que ocurran.
          </p>
        </div>

        {/* ── THE DASHBOARD CARD ── */}
        <div className="circle-dashboard reveal" style={{ animationDelay: "0.1s" }}>

          {/* Sarape stripe header */}
          <div className="cd-sarape-header" aria-hidden="true" />

          {/* Browser chrome bar */}
          <div className="cd-topbar" aria-hidden="true">
            <div className="topbar-dot td-red" />
            <div className="topbar-dot td-amber" />
            <div className="topbar-dot td-green" />
            <span className="topbar-url">
              tanda.app / círculos / {circleAddress.slice(0, 10)}…
            </span>
            <span className="topbar-live">
              <span className="live-dot" />
              Ronda activa
            </span>
          </div>

          {/* Dashboard body */}
          <div className="cd-body">

            {/* Circle header row */}
            <CircleHeader view={view} />

            {/* AI early-warning banner */}
            <AiWarningBanner
              members={view.members}
              circleAddress={circleAddress}
              onFlagAtRisk={handleFlagAtRisk}
              isFlagging={
                flagAtRisk.isFetching ||
                flagAtRisk.isPending ||
                flagAtRisk.isConfirming
              }
            />

            {/* Gasless passkey onboarding — shown while the circle is still Forming */}
            {view.state === 0 && (
              <div style={{ marginBottom: 24 }}>
                <div
                  className="text-[0.65rem] font-bold tracking-[0.16em] uppercase mb-2"
                  style={{ color: "rgba(237,217,163,0.5)" }}
                >
                  Tanda en formación — onboarding sin gas
                </div>
                <PasskeyJoinButton circle={circleAddress} onJoined={view.refetch} />
              </div>
            )}

            {/* Resolver ronda button */}
            <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
              <button
                className="btn-secondary"
                style={{ fontSize: "0.82rem", padding: "10px 24px" }}
                onClick={handleResolveRound}
                disabled={resolveRound.isPending || resolveRound.isConfirming}
              >
                {resolveRound.isPending || resolveRound.isConfirming
                  ? "Procesando…"
                  : "Resolver ronda"}
              </button>
              {resolveRound.error && (
                <span style={{ fontSize: "0.75rem", color: "#FCA5A5" }}>
                  {resolveRound.error.includes("RoundNotExpired")
                    ? "La ronda aún no ha expirado"
                    : resolveRound.error.slice(0, 80)}
                </span>
              )}
            </div>

            {/* Members section label */}
            <div className="members-label" aria-label="AI-scored circle members">
              Miembros del círculo — Puntuados por IA
            </div>

            {/* 4 member cards */}
            <div className="members-grid">
              {view.members.map((m, i) => (
                <MemberCard
                  key={m.address}
                  member={m}
                  contributionAmount={view.contributionAmount}
                  currentRound={view.currentRound}
                  animDelay={ANIM_DELAYS[i] ?? "0.5s"}
                  connectedAddress={connectedAddress}
                  onContribute={handleContribute}
                  onTopUp={handleTopUp}
                  isContributing={isContributing}
                  isToppingUp={isToppingUp}
                />
              ))}
            </div>

            {/* Auction row */}
            <AuctionRow />

            {/* Dashboard footer */}
            <div className="cd-footer">
              <InsurancePoolCard poolBalance={view.poolBalance} />

              <div className="next-block">
                <div className="next-lbl">Receptora esta ronda</div>
                <div className="next-name-val">{nextName}</div>
                <div className="next-amount-val">
                  {formatMXNB(view.pot)} MXNB · Pote total
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Bottom metadata */}
        <div
          className="mt-6 flex items-center gap-3 text-[0.68rem] font-semibold tracking-[0.10em] uppercase"
          style={{ color: "rgba(237,217,163,0.25)" }}
        >
          <span
            className="w-[5px] h-[5px] rounded-full"
            style={{ background: "#0F9090" }}
          />
          {activeChain.name} · Chain ID {activeChain.id} · MXNB · Non-custodial
          <span className="ml-auto font-mono" style={{ color: "rgba(237,217,163,0.18)" }}>
            {circleAddress}
          </span>
        </div>
      </main>
    </div>
  );
}

export default function CirclePage() {
  const params = useParams();
  const rawAddress = Array.isArray(params.address)
    ? params.address[0]
    : params.address ?? "0x";

  const circleAddress = rawAddress as `0x${string}`;

  return (
    <TxToastProvider>
      <CircleDashboard circleAddress={circleAddress} />
    </TxToastProvider>
  );
}
