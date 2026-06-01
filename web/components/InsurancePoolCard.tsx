import { formatMXNB } from "@/lib/format";

interface InsurancePoolCardProps {
  poolBalance: bigint;
}

export default function InsurancePoolCard({ poolBalance }: InsurancePoolCardProps) {
  return (
    <div className="insurance-block">
      <div className="ins-icon">🛡</div>
      <div>
        <div className="ins-label">Fondo de protección</div>
        <div className="ins-amount">{formatMXNB(poolBalance)} MXNB</div>
        <div className="ins-sub">
          Disponible · Cubre hasta 2 impagos simultáneos · Pool compartido
        </div>
      </div>
    </div>
  );
}
