import { trustTier } from "@/lib/format";

interface ScoreRingProps {
  score: number;
  className?: string;
}

const tierColors = {
  high: {
    num: "#6EE7B7",
    fill: "linear-gradient(90deg, #059669, #6EE7B7)",
  },
  mid: {
    num: "#F59E0B",
    fill: "linear-gradient(90deg, #D97706, #F59E0B)",
  },
  low: {
    num: "#FCD34D",
    fill: "linear-gradient(90deg, #D97706, #FCD34D)",
  },
  flag: {
    num: "#FCA5A5",
    fill: "linear-gradient(90deg, #991B1B, #DC2626)",
  },
};

export default function ScoreRing({ score, className = "" }: ScoreRingProps) {
  const tier = trustTier(score);
  const colors = tierColors[tier];
  const pct = Math.min(100, Math.max(0, score));

  return (
    <div className={`ai-score-section ${className}`}>
      <div className="score-header">
        <span className="score-lbl">Score IA</span>
        <span className="score-num" style={{ color: colors.num }}>
          {score}
        </span>
      </div>
      <div className="score-track">
        <div
          className="score-fill"
          style={{
            width: `${pct}%`,
            background: colors.fill,
          }}
        />
      </div>
    </div>
  );
}
