interface FeatureCardProps {
  icon: string;
  title: string;
  body: string;
  accentColor?: string;
  iconBg?: string;
  index?: number;
}

export default function FeatureCard({
  icon,
  title,
  body,
  accentColor = "#D97706",
  iconBg = "rgba(217,119,6,0.18)",
}: FeatureCardProps) {
  return (
    <div
      className="relative overflow-hidden rounded-[6px] grid gap-4 items-start p-5 transition-all duration-200 hover:translate-x-[5px] backdrop-blur-sm"
      style={{
        gridTemplateColumns: "52px 1fr",
        background: "rgba(250,243,224,0.06)",
        border: "1px solid rgba(237,217,163,0.14)",
      }}
    >
      {/* Left accent bar */}
      <span
        className="absolute top-0 left-0 w-[3px] h-full"
        style={{ background: accentColor }}
        aria-hidden="true"
      />

      {/* Icon circle */}
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center text-2xl flex-shrink-0"
        style={{ background: iconBg }}
        aria-hidden="true"
      >
        {icon}
      </div>

      {/* Text */}
      <div>
        <div className="text-[0.85rem] font-bold text-[#FAF3E0] tracking-[0.04em] uppercase mb-1">
          {title}
        </div>
        <div
          className="text-[0.85rem] leading-[1.55]"
          style={{ color: "rgba(237,217,163,0.68)" }}
        >
          {body}
        </div>
      </div>
    </div>
  );
}
