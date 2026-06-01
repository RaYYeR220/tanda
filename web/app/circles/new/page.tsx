"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEventLogs } from "viem";
import { addresses, abis } from "@/lib/contracts";
import { TxToastProvider, useTxToast } from "@/components/TxToast";

const ROUND_PRESETS = [
  { label: "1 minuto (demo)", seconds: 60 },
  { label: "1 hora", seconds: 3600 },
  { label: "1 día", seconds: 86400 },
  { label: "7 días", seconds: 604800 },
];

const BID_PRESETS = [
  { label: "30 segundos (demo)", seconds: 30 },
  { label: "15 minutos", seconds: 900 },
  { label: "1 hora", seconds: 3600 },
  { label: "6 horas", seconds: 21600 },
];

function CreateCircleForm() {
  const router = useRouter();
  const toast = useTxToast();

  const [contribution, setContribution] = useState("100");
  const [members, setMembers] = useState(4);
  const [roundIdx, setRoundIdx] = useState(0);
  const [bidIdx, setBidIdx] = useState(0);

  const {
    writeContract,
    data: hash,
    isPending,
    error: writeError,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess,
    data: receipt,
  } = useWaitForTransactionReceipt({ hash });

  const [toastId, setToastId] = useState<string | null>(null);

  // Update toast when tx hash appears
  useEffect(() => {
    if (hash && toastId) {
      toast.update(toastId, { hash, status: "confirming", action: "Confirmando creación…" });
    }
  }, [hash, toastId, toast]);

  // Update toast on write error
  useEffect(() => {
    if (writeError && toastId) {
      toast.update(toastId, {
        status: "error",
        error: (writeError.message ?? String(writeError)).slice(0, 120),
      });
    }
  }, [writeError, toastId, toast]);

  // On success: decode the new circle address and route
  useEffect(() => {
    if (isSuccess && receipt && toastId) {
      try {
        const logs = parseEventLogs({
          abi: abis.CircleFactory,
          logs: receipt.logs,
          eventName: "CircleCreated",
        });
        const args = logs[0]?.args as { circle?: `0x${string}` } | undefined;
        const newCircle = args?.circle;
        if (newCircle) {
          toast.update(toastId, {
            status: "success",
            action: `Círculo creado: ${newCircle.slice(0, 8)}…`,
          });
          // Short delay so user sees the success toast
          setTimeout(() => router.push(`/circles/${newCircle}`), 1500);
        } else {
          toast.update(toastId, { status: "success", action: "Círculo creado ✓" });
        }
      } catch {
        toast.update(toastId, { status: "success", action: "Círculo creado ✓" });
      }
    }
  }, [isSuccess, receipt, toastId, toast, router]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const contributionRaw = parseFloat(contribution);
    if (isNaN(contributionRaw) || contributionRaw <= 0) return;
    const contributionAmount = BigInt(Math.round(contributionRaw * 1_000_000));
    const roundDuration = BigInt(ROUND_PRESETS[roundIdx].seconds);
    const bidDuration = BigInt(BID_PRESETS[bidIdx].seconds);

    const id = toast.push({ action: "Creando círculo…", status: "pending" });
    setToastId(id);

    writeContract({
      address: addresses.factory,
      abi: abis.CircleFactory,
      functionName: "createCircle",
      args: [contributionAmount, members, roundDuration, bidDuration],
    });
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "rgba(255,255,255,0.06)",
    border: "1.5px solid rgba(237,217,163,0.18)",
    borderRadius: 6,
    padding: "12px 16px",
    color: "#FAF3E0",
    fontSize: "0.95rem",
    fontFamily: "var(--font-body, sans-serif)",
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.68rem",
    fontWeight: 800,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: "rgba(237,217,163,0.50)",
    marginBottom: 8,
  };

  const contributionNum = parseFloat(contribution) || 0;

  return (
    <div className="min-h-screen" style={{ background: "#1C1410" }}>
      <div className="sarape-stripe" />

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

      <main className="max-w-[560px] mx-auto px-6 py-14">
        <div className="mb-8">
          <div
            className="text-[0.65rem] font-bold tracking-[0.18em] uppercase mb-2"
            style={{ color: "#D97706" }}
          >
            Crear nueva tanda
          </div>
          <h1
            className="font-display mb-3"
            style={{
              fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
              color: "#FAF3E0",
              letterSpacing: "-0.01em",
              lineHeight: 1.1,
            }}
          >
            Nueva tanda{" "}
            <span style={{ color: "#F59E0B" }}>on-chain</span>
          </h1>
          <p
            className="text-[0.88rem]"
            style={{ color: "rgba(237,217,163,0.45)", maxWidth: 480 }}
          >
            Define los parámetros y despliega tu tanda en la cadena. Los miembros
            se unen después pagando colateral + prima al agente IA.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(237,217,163,0.10)",
            borderRadius: 12,
            padding: "32px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          {/* Contribution amount */}
          <div>
            <label htmlFor="contribution" style={labelStyle}>
              Contribución por ronda (MXNB)
            </label>
            <input
              id="contribution"
              type="number"
              min="1"
              step="any"
              value={contribution}
              onChange={(e) => setContribution(e.target.value)}
              style={inputStyle}
              required
            />
          </div>

          {/* Members */}
          <div>
            <label htmlFor="members" style={labelStyle}>
              Número de miembros (2–8)
            </label>
            <input
              id="members"
              type="number"
              min="2"
              max="8"
              value={members}
              onChange={(e) => setMembers(Number(e.target.value))}
              style={inputStyle}
              required
            />
          </div>

          {/* Round duration */}
          <div>
            <label htmlFor="roundDuration" style={labelStyle}>
              Duración de ronda
            </label>
            <select
              id="roundDuration"
              value={roundIdx}
              onChange={(e) => setRoundIdx(Number(e.target.value))}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {ROUND_PRESETS.map((p, i) => (
                <option key={i} value={i} style={{ background: "#2A1E18" }}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Bid duration */}
          <div>
            <label htmlFor="bidDuration" style={labelStyle}>
              Duración de subasta (por ronda)
            </label>
            <select
              id="bidDuration"
              value={bidIdx}
              onChange={(e) => setBidIdx(Number(e.target.value))}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {BID_PRESETS.map((p, i) => (
                <option key={i} value={i} style={{ background: "#2A1E18" }}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Summary */}
          <div
            style={{
              background: "rgba(217,119,6,0.07)",
              border: "1px solid rgba(217,119,6,0.18)",
              borderRadius: 7,
              padding: "14px 16px",
              fontSize: "0.82rem",
              color: "rgba(237,217,163,0.65)",
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: "#F59E0B" }}>Resumen:</strong>{" "}
            {members} miembros · {contributionNum} MXNB/ronda ·{" "}
            Pote total {(contributionNum * members).toFixed(0)} MXNB ·{" "}
            {ROUND_PRESETS[roundIdx].label}
          </div>

          <button
            type="submit"
            className="btn-primary"
            style={{ justifyContent: "center" }}
            disabled={isPending || isConfirming}
          >
            {isPending
              ? "Confirma en tu wallet…"
              : isConfirming
              ? "Desplegando…"
              : "Crear tanda →"}
          </button>

          {writeError && (
            <p style={{ fontSize: "0.78rem", color: "#FCA5A5", margin: 0 }}>
              {(writeError.message ?? String(writeError)).slice(0, 200)}
            </p>
          )}
        </form>
      </main>
    </div>
  );
}

export default function NewCirclePage() {
  return (
    <TxToastProvider>
      <CreateCircleForm />
    </TxToastProvider>
  );
}
