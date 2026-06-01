/** On-chain reputation tuple as read from ReputationSBT.reputation(address). */
export interface Reputation {
  roundsParticipated: number;
  onTime: number;
  late: number;
  defaults: number;
  circlesCompleted: number;
}

/** Off-chain wallet metadata used by the AI for cold-start nuance. */
export interface WalletMeta {
  ageDays: number;
  txCount: number;
  mxnbBalance: bigint;
}

/** The AI's structured decision (before signing). */
export interface UnderwritingDecision {
  adjustedScore: number; // 0..100
  rationale: string;
}
