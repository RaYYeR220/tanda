"use client";

import { Member } from "@/lib/useCircle";
import { getMemberInfo } from "@/lib/memberMap";

interface AiWarningBannerProps {
  members: Member[];
  /** Address of circle (needed by parent to call flagAtRisk) */
  circleAddress?: `0x${string}`;
  /** Called to submit the AI risk flag for the first at-risk member */
  onFlagAtRisk?: (member: `0x${string}`) => void;
  isFlagging?: boolean;
}

export default function AiWarningBanner({
  members,
  onFlagAtRisk,
  isFlagging = false,
}: AiWarningBannerProps) {
  const atRiskMembers = members.filter((m) => m.atRisk || m.hasDefaulted);

  if (atRiskMembers.length === 0) {
    // No flagged members — show subtle "trigger AI flag" strip for demo
    if (!onFlagAtRisk) return null;
    const unflaggedCandidates = members.filter((m) => !m.atRisk && !m.hasDefaulted);
    if (unflaggedCandidates.length === 0) return null;
    // Prefer 0xkito for the demo, otherwise first candidate
    const target =
      unflaggedCandidates.find((m) => getMemberInfo(m.address).name === "0xkito") ??
      unflaggedCandidates[0];
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 16px",
          marginBottom: 20,
          background: "rgba(217,119,6,0.07)",
          border: "1px solid rgba(217,119,6,0.20)",
          borderRadius: 7,
        }}
      >
        <span style={{ fontSize: "0.75rem", color: "rgba(237,217,163,0.55)", flex: 1 }}>
          Agente IA — Sin alertas activas
        </span>
        <button
          className="btn-secondary"
          style={{ fontSize: "0.72rem", padding: "6px 14px" }}
          onClick={() => onFlagAtRisk(target.address)}
          disabled={isFlagging}
        >
          {isFlagging ? "Consultando IA…" : "Marcar en riesgo (IA)"}
        </button>
      </div>
    );
  }

  const names = atRiskMembers.map((m) => getMemberInfo(m.address).name).join(", ");
  // Only show flag button if there's a non-flagged candidate left
  const unflagged = members.filter((m) => !m.atRisk && !m.hasDefaulted);
  const canFlag = !!onFlagAtRisk && unflagged.length > 0;
  const target =
    unflagged.find((m) => getMemberInfo(m.address).name === "0xkito") ?? unflagged[0];

  return (
    <div className="ai-warning" role="alert" aria-live="assertive">
      <div className="warn-icon">⚠️</div>
      <div className="warn-body">
        <div className="warn-eyebrow">
          Agente IA — Alerta de riesgo de impago
        </div>
        <div className="warn-text">
          El agente detectó{" "}
          <strong>riesgo de impago de {names}</strong> esta ronda — se
          solicitó refuerzo de colateral. Acción preventiva: colateral
          bloqueado en escrow.
        </div>
      </div>
      {canFlag && target ? (
        <button
          className="warn-action"
          type="button"
          onClick={() => onFlagAtRisk!(target.address)}
          disabled={isFlagging}
        >
          {isFlagging ? "Enviando…" : "Marcar en riesgo (IA)"}
        </button>
      ) : (
        <button className="warn-action" type="button" disabled>
          Flagged ✓
        </button>
      )}
    </div>
  );
}
