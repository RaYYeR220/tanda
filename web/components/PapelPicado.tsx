interface PapelPicadoProps {
  colors?: string[];
  variant?: "hero" | "divider" | "footer" | "default";
  className?: string;
}

const FLAG_COUNT = 28;

export default function PapelPicado({
  variant = "default",
  className = "",
}: PapelPicadoProps) {
  const wrapperBg =
    variant === "hero"
      ? "bg-[#8B2500]"
      : variant === "divider"
      ? "bg-gradient-to-b from-[#8B2500] to-[#FAF3E0]"
      : variant === "footer"
      ? "bg-[#1C1410]"
      : "";

  return (
    <div className={`${wrapperBg} ${className}`} aria-hidden="true">
      <div className="papel-picado">
        <div className="pp-flags">
          {Array.from({ length: FLAG_COUNT }).map((_, i) => (
            <div key={i} className="pp-flag" />
          ))}
        </div>
      </div>
    </div>
  );
}
