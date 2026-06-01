const items = [
  "Built on Arbitrum",
  "Settles in MXNB",
  "Non-custodial",
];

export default function TrustStrip() {
  return (
    <div
      className="flex flex-wrap items-center gap-0"
      aria-label="Trust indicators"
    >
      {items.map((item, i) => (
        <div
          key={item}
          className="flex items-center gap-[7px] text-[0.72rem] font-semibold tracking-[0.09em] uppercase text-[rgba(237,217,163,0.5)] pr-5 mr-5 last:border-r-0 last:pr-0 last:mr-0"
          style={{
            borderRight: i < items.length - 1 ? "1px solid rgba(237,217,163,0.18)" : "none",
          }}
        >
          <span
            className="w-[5px] h-[5px] rounded-full flex-shrink-0"
            style={{ background: "#0F9090" }}
          />
          {item}
        </div>
      ))}
    </div>
  );
}
