import type { Member } from "@/lib/useCircle";
import { formatMXNB } from "@/lib/format";
import { getMemberInfo } from "@/lib/memberMap";

/**
 * Slot auction (tanda de puja). When a circle ran a real bidding phase, this renders the LIVE
 * result from chain: each member's bid, their AI-allowed earliest slot (the risk band floor),
 * and the slot they actually won — making it visible when a high bid was blocked from an early
 * slot by a low score. For fixed-order circles (no bidding), it explains the mechanism.
 */
export default function AuctionRow({
  members,
  biddingOccurred,
}: {
  members: Member[];
  biddingOccurred: boolean;
}) {
  if (!biddingOccurred) {
    return (
      <div className="auction-row">
        <div className="auction-icon">🔨</div>
        <div>
          <div className="auction-label">Tanda de puja — Slot Auction</div>
          <div className="auction-text">
            En modo puja, los miembros ofrecen una cuota por un turno más temprano. La IA limita
            los slots tempranos a miembros de bajo riesgo: una billetera con score bajo no puede
            comprar un turno temprano por más que puje. Esta tanda usa orden fijo.
          </div>
        </div>
      </div>
    );
  }

  const byBid = [...members].sort((a, b) =>
    b.bidFee > a.bidFee ? 1 : b.bidFee < a.bidFee ? -1 : 0,
  );
  const top = byBid[0];
  const blocked = top && top.bidFee > 0n && top.earliestSlot > 0;

  return (
    <div className="auction-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div className="auction-icon">🔨</div>
        <div>
          <div className="auction-label">Tanda de puja — Slot Auction (en vivo)</div>
          <div className="auction-text">
            Los miembros pujan por turnos más tempranos; la IA limita los slots tempranos según el
            riesgo. Resultado real on-chain:
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        {byBid.map((m) => {
          const name = getMemberInfo(m.address).name;
          const isBlocked = m.bidFee > 0n && m.earliestSlot > 0;
          return (
            <div
              key={m.address}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: "0.8rem",
                padding: "8px 12px",
                borderRadius: 8,
                background: isBlocked ? "rgba(194,54,43,0.12)" : "rgba(237,217,163,0.05)",
                border: isBlocked
                  ? "1px solid rgba(194,54,43,0.35)"
                  : "1px solid rgba(237,217,163,0.12)",
                color: "#EDD9A3",
              }}
            >
              <span style={{ fontWeight: 700, minWidth: 70 }}>{name}</span>
              <span style={{ color: "rgba(237,217,163,0.75)" }}>
                pujó <strong>{formatMXNB(m.bidFee)} MXNB</strong>
              </span>
              <span style={{ color: "rgba(237,217,163,0.55)" }}>score {m.score}</span>
              <span style={{ marginLeft: "auto", fontWeight: 700 }}>
                ganó slot #{m.slot + 1}
              </span>
              {m.earliestSlot > 0 && (
                <span style={{ color: "#E8A317", fontSize: "0.72rem" }}>
                  IA: slot mín #{m.earliestSlot + 1}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {blocked && (
        <div className="auction-blocked" style={{ alignSelf: "flex-start" }}>
          🚫 {getMemberInfo(top.address).name} pujó la cuota más alta ({formatMXNB(top.bidFee)} MXNB)
          pero la IA bloqueó un score {top.score} de los slots tempranos
        </div>
      )}
    </div>
  );
}
