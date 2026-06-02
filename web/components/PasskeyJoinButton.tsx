"use client";

import { useState } from "react";
import { joinCircleGasless, type GaslessJoinResult } from "@/lib/aa";
import { activeChain } from "@/lib/chain";
import { shortAddr } from "@/lib/format";

type Phase = "idle" | "busy" | "done" | "error";

/**
 * "Únete con passkey (sin gas)" — gasless onboarding as a progressive enhancement.
 * One Pimlico-sponsored UserOperation mints demo MXNB, approves, and joins the circle,
 * authorized only by a device passkey. No wallet, no ETH, no pre-funded MXNB.
 */
export default function PasskeyJoinButton({
  circle,
  onJoined,
}: {
  circle: `0x${string}`;
  onJoined?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState<string>("");
  const [result, setResult] = useState<GaslessJoinResult | null>(null);
  const [error, setError] = useState<string>("");

  const explorer = activeChain.blockExplorers?.default?.url;

  async function handleJoin() {
    setPhase("busy");
    setError("");
    setResult(null);
    try {
      setStep("Creando tu passkey…");
      // The passkey prompt + AI scoring + sponsored userop happen inside joinCircleGasless.
      // We flip the label once the OS prompt is likely dismissed and the userop is in flight.
      const res = await joinCircleGasless({
        circle,
        displayName: "Tanda — nuevo miembro",
      });
      setResult(res);
      setPhase("done");
      onJoined?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  if (phase === "done" && result) {
    return (
      <div
        className="rounded-lg p-4 text-[0.8rem]"
        style={{
          background: "rgba(62,142,90,0.12)",
          border: "1px solid rgba(62,142,90,0.4)",
          color: "#EDD9A3",
        }}
      >
        <div className="font-bold tracking-[0.08em] uppercase mb-1" style={{ color: "#7BCf9B" }}>
          ✓ Te uniste sin gas — con solo tu passkey
        </div>
        <div style={{ color: "rgba(237,217,163,0.85)" }}>
          Cuenta inteligente <span className="font-mono">{shortAddr(result.smartAccount)}</span> ·
          score IA <strong>{result.adjustedScore}</strong> · 0 ETH de gas pagado.
        </div>
        {explorer && (
          <a
            href={`${explorer}/tx/${result.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 font-semibold underline"
            style={{ color: "#F2820D" }}
          >
            Ver la transacción patrocinada ↗
          </a>
        )}
      </div>
    );
  }

  return (
    <div>
      <button className="btn-primary" onClick={handleJoin} disabled={phase === "busy"}>
        <span aria-hidden="true">🔑</span>
        {phase === "busy" ? step || "Patrocinando…" : "Únete con passkey (sin gas)"}
      </button>
      {phase === "busy" && (
        <p className="mt-2 text-[0.72rem]" style={{ color: "rgba(237,217,163,0.6)" }}>
          Confirma con tu huella / Face ID. Pimlico patrocina el gas — no necesitas ETH ni billetera.
        </p>
      )}
      {phase === "error" && (
        <p className="mt-2 text-[0.72rem]" style={{ color: "#E89A8A" }}>
          {error}
        </p>
      )}
    </div>
  );
}
