import {
  MockMXNB_ABI,
  ReputationSBT_ABI,
  Underwriter_ABI,
  InsurancePool_ABI,
  CircleFactory_ABI,
  TandaCircle_ABI,
} from "./abis";

type Addr = `0x${string}`;

/** Addresses are injected at build/runtime via NEXT_PUBLIC_* env (set after deploy/seed). */
export const addresses = {
  mxnb: (process.env.NEXT_PUBLIC_MXNB ?? "0x") as Addr,
  reputation: (process.env.NEXT_PUBLIC_REPUTATION ?? "0x") as Addr,
  underwriter: (process.env.NEXT_PUBLIC_UNDERWRITER ?? "0x") as Addr,
  insurancePool: (process.env.NEXT_PUBLIC_INSURANCE ?? "0x") as Addr,
  factory: (process.env.NEXT_PUBLIC_FACTORY ?? "0x") as Addr,
  demoCircle: (process.env.NEXT_PUBLIC_DEMO_CIRCLE ?? "0x") as Addr,
};

export const abis = {
  MockMXNB: MockMXNB_ABI,
  ReputationSBT: ReputationSBT_ABI,
  Underwriter: Underwriter_ABI,
  InsurancePool: InsurancePool_ABI,
  CircleFactory: CircleFactory_ABI,
  TandaCircle: TandaCircle_ABI,
};
