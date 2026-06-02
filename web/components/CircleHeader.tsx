import { CircleView } from "@/lib/useCircle";
import { formatMXNB } from "@/lib/format";
import { getMemberInfo } from "@/lib/memberMap";

const STATE_LABELS: Record<number, string> = {
  0: "FORMANDO",
  1: "PUJA",
  2: "ACTIVA",
  3: "COMPLETADA",
  4: "IMPAGO",
};

interface CircleHeaderProps {
  view: CircleView;
}

export default function CircleHeader({ view }: CircleHeaderProps) {
  const {
    contributionAmount,
    pot,
    currentRound,
    roundsTotal,
    state,
    members,
    nextRecipient,
    poolBalance,
  } = view;

  const stateLabel = STATE_LABELS[state] ?? "ACTIVA";
  const isCompleted = state === 3;
  const displayRound = currentRound + 1; // 1-indexed for display

  const nextName = nextRecipient
    ? getMemberInfo(nextRecipient).name
    : "—";

  // Build round pips
  const pips = Array.from({ length: roundsTotal }, (_, i) => {
    if (isCompleted || i < currentRound) return "done";
    if (i === currentRound) return "active";
    return "pending";
  });

  return (
    <div className="circle-header">
      {/* Left: name + meta row */}
      <div>
        <div className="circle-name-row">
          <span className="circle-name">Tanda Oaxaca</span>
          <span className="badge-activa">{stateLabel}</span>
        </div>
        <div className="circle-meta-row">
          <div className="cmeta">
            <span className="cmeta-label">Pote total</span>
            <span className="cmeta-value hl">{formatMXNB(pot)} MXNB</span>
          </div>
          <div className="cmeta">
            <span className="cmeta-label">Contribución</span>
            <span className="cmeta-value">{formatMXNB(contributionAmount)} MXNB</span>
          </div>
          <div className="cmeta">
            <span className="cmeta-label">Miembros</span>
            <span className="cmeta-value">{members.length}</span>
          </div>
          <div className="cmeta">
            <span className="cmeta-label">{isCompleted ? "Rondas pagadas" : "Próxima receptora"}</span>
            <span className="cmeta-value teal">
              {isCompleted ? `${roundsTotal}/${roundsTotal} ✓` : `${nextName} ✓`}
            </span>
          </div>
          <div className="cmeta">
            <span className="cmeta-label">Fondo protección</span>
            <span className="cmeta-value teal">{formatMXNB(poolBalance)} MXNB</span>
          </div>
        </div>
      </div>

      {/* Right: round pips + pot */}
      <div className="round-block">
        <span className="round-label-sm">
          {isCompleted
            ? `Completada · ${roundsTotal}/${roundsTotal}`
            : `Ronda ${displayRound} de ${roundsTotal}`}
        </span>
        <div
          className="round-pips"
          aria-label={`Ronda ${displayRound} de ${roundsTotal}`}
        >
          {pips.map((pip, i) => (
            <div
              key={i}
              className={`pip${pip === "done" ? " done" : pip === "active" ? " active" : ""}`}
              title={
                pip === "done"
                  ? `Ronda ${i + 1} completada`
                  : pip === "active"
                  ? `Ronda ${i + 1} activa`
                  : `Ronda ${i + 1} pendiente`
              }
            />
          ))}
        </div>
        <div className="pot-num">{formatMXNB(pot)} MXNB</div>
        <div className="pot-sub">Pote · Esta ronda</div>
      </div>
    </div>
  );
}
