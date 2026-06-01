export default function AuctionRow() {
  return (
    <div className="auction-row">
      <div className="auction-icon">🔨</div>
      <div>
        <div className="auction-label">Tanda de puja — Slot Auction</div>
        <div className="auction-text">
          Los miembros pujan por turnos más tempranos dentro de las bandas de
          riesgo permitidas por la IA.{" "}
          <strong>0xkito ofreció 80 MXNB por el slot #2</strong> — puja
          rechazada: score insuficiente. La IA protege al grupo.
        </div>
      </div>
      <div className="auction-blocked">🚫 Bloqueado por IA</div>
    </div>
  );
}
