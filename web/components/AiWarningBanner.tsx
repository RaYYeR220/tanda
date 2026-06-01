import { Member } from "@/lib/useCircle";
import { getMemberInfo } from "@/lib/memberMap";

interface AiWarningBannerProps {
  members: Member[];
}

export default function AiWarningBanner({ members }: AiWarningBannerProps) {
  const atRiskMembers = members.filter((m) => m.atRisk || m.hasDefaulted);

  if (atRiskMembers.length === 0) return null;

  const names = atRiskMembers.map((m) => getMemberInfo(m.address).name).join(", ");

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
      <button className="warn-action" type="button">
        Ver detalles
      </button>
    </div>
  );
}
