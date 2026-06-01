"use client";

import { useState } from "react";
import { Member } from "@/lib/useCircle";
import { trustTier, formatMXNB, collateralMultiplier } from "@/lib/format";
import { getMemberInfo } from "@/lib/memberMap";
import ScoreRing from "./ScoreRing";

interface MemberCardProps {
  member: Member;
  contributionAmount: bigint;
  currentRound: number;
  animDelay?: string;
  /** Address of the currently connected wallet */
  connectedAddress?: `0x${string}`;
  /** Called when user clicks Contribuir (approves then contributes) */
  onContribute?: () => void;
  /** Called when user clicks Reforzar with a chosen amount */
  onTopUp?: (amount: bigint) => void;
  isContributing?: boolean;
  isToppingUp?: boolean;
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
  connectedAddress,
  onContribute,
  onTopUp,
  isContributing = false,
  isToppingUp = false,
}: MemberCardProps) {
  const tier = trustTier(member.score);
  const { name, handle, rationale } = getMemberInfo(member.address);
  const multStr = collateralMultiplier(member.collateral, contributionAmount);
  const collateralMXNB = formatMXNB(member.collateral);
  const isFlagged = member.atRisk || member.hasDefaulted;
  const isNextRecipient = member.slot === currentRound;
  const initial = name.slice(0, 1).toUpperCase();
  const avatarLetter = isFlagged ? "⚠" : initial;

  const isMe =
    !!connectedAddress &&
    member.address.toLowerCase() === connectedAddress.toLowerCase();
  const canContribute = isMe && !member.contributed && !!onContribute;
  const canTopUp = isMe && (member.atRisk || member.hasDefaulted) && !!onTopUp;

  const [topUpAmt, setTopUpAmt] = useState("100");

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

        {/* ── ACTION ZONE ── */}
        {canContribute && (
          <button
            className="btn-primary"
            style={{ marginTop: 12, width: "100%", fontSize: "0.80rem", padding: "10px 16px" }}
            onClick={onContribute}
            disabled={isContributing}
          >
            {isContributing ? "Procesando…" : `Contribuir ${formatMXNB(contributionAmount)} MXNB`}
          </button>
        )}

        {canTopUp && (
          <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
            <input
              type="number"
              min="1"
              value={topUpAmt}
              onChange={(e) => setTopUpAmt(e.target.value)}
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(237,217,163,0.22)",
                borderRadius: 4,
                padding: "8px 10px",
                color: "#FAF3E0",
                fontSize: "0.80rem",
                fontFamily: "var(--font-body, sans-serif)",
              }}
              placeholder="MXNB"
            />
            <button
              className="btn-secondary"
              style={{ fontSize: "0.75rem", padding: "8px 14px", whiteSpace: "nowrap" }}
              onClick={() => {
                const n = parseFloat(topUpAmt);
                if (!isNaN(n) && n > 0 && onTopUp) {
                  onTopUp(BigInt(Math.round(n * 1_000_000)));
                }
              }}
              disabled={isToppingUp}
            >
              {isToppingUp ? "…" : "Reforzar"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
