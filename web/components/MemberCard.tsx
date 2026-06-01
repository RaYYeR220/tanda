import { Member } from "@/lib/useCircle";
import { trustTier, formatMXNB, collateralMultiplier } from "@/lib/format";
import { getMemberInfo } from "@/lib/memberMap";
import ScoreRing from "./ScoreRing";

interface MemberCardProps {
  member: Member;
  contributionAmount: bigint;
  currentRound: number;
  animDelay?: string;
}

const BAND_CLASS: Record<string, string> = {
  high: "band-green",
  mid: "band-amber",
  low: "band-amber2",
  flag: "band-red",
};

const TRUST_LABEL: Record<string, string> = {
  high: "Alta",
  mid: "Media",
  low: "Baja",
  flag: "Crítica",
};

const TRUST_VALUE_COLOR: Record<string, string> = {
  high: "#6EE7B7",
  mid: "#F59E0B",
  low: "#FCD34D",
  flag: "#FCA5A5",
};

export default function MemberCard({
  member,
  contributionAmount,
  currentRound,
  animDelay,
}: MemberCardProps) {
  const tier = trustTier(member.score);
  const { name, handle, rationale } = getMemberInfo(member.address);
  const multStr = collateralMultiplier(member.collateral, contributionAmount);
  const collateralMXNB = formatMXNB(member.collateral);
  const isFlagged = member.atRisk || member.hasDefaulted;
  const isNextRecipient = member.slot === currentRound;
  const initial = name.slice(0, 1).toUpperCase();
  const avatarLetter = isFlagged ? "⚠" : initial;

  return (
    <div
      className={`mc trust-${tier} reveal`}
      style={{ animationDelay: animDelay }}
    >
      <div className={`mc-band ${BAND_CLASS[tier]}`} />
      <div className="mc-body">
        {/* Header: avatar + name/handle/slot */}
        <div className="mc-header">
          <div className="mc-avatar">{avatarLetter}</div>
          <div>
            <div className="mc-name">{name}</div>
            <div className="mc-handle">{handle}</div>
            {isNextRecipient ? (
              <div className="mc-slot slot-current">
                📦 Slot #{member.slot + 1} — Receptora esta ronda
              </div>
            ) : (
              <div className="mc-slot">Slot #{member.slot + 1}</div>
            )}
            {isFlagged && (
              <div className="flagged-badge">⚑ FLAGGED</div>
            )}
          </div>
        </div>

        {/* AI Score bar */}
        <ScoreRing score={member.score} />

        {/* Collateral + trust level stats */}
        <div className="mc-stats">
          <div>
            <div className="mc-stat-key">Colateral</div>
            <div className="mc-stat-val">{multStr}</div>
            <div className="mc-stat-sub">= {collateralMXNB} MXNB</div>
          </div>
          <div>
            <div className="mc-stat-key">Confianza</div>
            <div
              className="mc-stat-val"
              style={{ color: TRUST_VALUE_COLOR[tier] }}
            >
              {TRUST_LABEL[tier]}
            </div>
          </div>
        </div>

        {/* AI rationale */}
        <div className={`mc-rationale${tier === "flag" ? " trust-flag" : ""}`}>
          {rationale}
        </div>
      </div>
    </div>
  );
}
