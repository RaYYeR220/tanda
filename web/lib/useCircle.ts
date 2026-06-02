"use client";

import { useCallback } from "react";
import { useReadContracts } from "wagmi";
import { keepPreviousData } from "@tanstack/react-query";
import { addresses, abis } from "./contracts";

export type Member = {
  address: `0x${string}`;
  index: number;
  score: number;
  collateral: bigint;
  contributed: boolean;
  atRisk: boolean;
  hasDefaulted: boolean;
  /** payout slot assigned to this member */
  slot: number;
};

export type CircleView = {
  loading: boolean;
  error?: string;
  contributionAmount: bigint;
  pot: bigint;
  currentRound: number;
  roundsTotal: number;
  state: number;
  members: Member[];
  nextRecipient?: `0x${string}`;
  poolBalance: bigint;
  refetch: () => Promise<void>;
};

const EMPTY_ADDR = "0x" as `0x${string}`;

export function useCircle(circleAddress: `0x${string}`): CircleView {
  const isValid = circleAddress && circleAddress !== "0x" && circleAddress.length === 42;

  // ── Phase 1: base reads ──────────────────────────────────────────
  const phase1 = useReadContracts({
    contracts: [
      {
        address: circleAddress,
        abi: abis.TandaCircle,
        functionName: "memberCount",
      },
      {
        address: circleAddress,
        abi: abis.TandaCircle,
        functionName: "currentRound",
      },
      {
        address: circleAddress,
        abi: abis.TandaCircle,
        functionName: "contributionAmount",
      },
      {
        address: circleAddress,
        abi: abis.TandaCircle,
        functionName: "state",
      },
    ],
    query: {
      enabled: !!isValid,
      refetchInterval: 4000,
      staleTime: 2000,
      placeholderData: keepPreviousData,
    },
  });

  const memberCount =
    phase1.data?.[0]?.status === "success"
      ? Number(phase1.data[0].result as bigint)
      : 0;
  const currentRound =
    phase1.data?.[1]?.status === "success"
      ? Number(phase1.data[1].result as bigint)
      : 0;
  const contributionAmount =
    phase1.data?.[2]?.status === "success"
      ? (phase1.data[2].result as bigint)
      : 0n;
  const stateVal =
    phase1.data?.[3]?.status === "success"
      ? Number(phase1.data[3].result as number)
      : 0;

  // ── Phase 2: member addresses ────────────────────────────────────
  const memberIndexes = memberCount > 0 ? Array.from({ length: memberCount }, (_, i) => i) : [];

  const phase2 = useReadContracts({
    contracts: memberIndexes.map((i) => ({
      address: circleAddress,
      abi: abis.TandaCircle,
      functionName: "members" as const,
      args: [BigInt(i)] as const,
    })),
    query: {
      enabled: !!isValid && memberCount > 0,
      refetchInterval: 4000,
      staleTime: 2000,
      placeholderData: keepPreviousData,
    },
  });

  const memberAddrs: `0x${string}`[] = memberIndexes.map((i) => {
    const r = phase2.data?.[i];
    return r?.status === "success" ? (r.result as `0x${string}`) : EMPTY_ADDR;
  });

  const allAddrsLoaded =
    memberCount > 0 &&
    memberAddrs.length === memberCount &&
    memberAddrs.every((a) => a !== EMPTY_ADDR);

  // ── Phase 3: per-member data + payoutOrder slots ─────────────────
  const perMemberContracts = allAddrsLoaded
    ? memberAddrs.flatMap((addr) => [
        {
          address: circleAddress,
          abi: abis.TandaCircle,
          functionName: "collateral" as const,
          args: [addr] as const,
        },
        {
          address: circleAddress,
          abi: abis.TandaCircle,
          functionName: "memberScore" as const,
          args: [addr] as const,
        },
        {
          address: circleAddress,
          abi: abis.TandaCircle,
          functionName: "contributedInRound" as const,
          args: [BigInt(currentRound), addr] as const,
        },
        {
          address: circleAddress,
          abi: abis.TandaCircle,
          functionName: "atRisk" as const,
          args: [BigInt(currentRound), addr] as const,
        },
        {
          address: circleAddress,
          abi: abis.TandaCircle,
          functionName: "hasDefaulted" as const,
          args: [addr] as const,
        },
      ])
    : [];

  const payoutOrderContracts = allAddrsLoaded
    ? memberIndexes.map((s) => ({
        address: circleAddress,
        abi: abis.TandaCircle,
        functionName: "payoutOrderAt" as const,
        args: [BigInt(s)] as const,
      }))
    : [];

  const insuranceContract = {
    address: addresses.insurancePool,
    abi: abis.InsurancePool,
    functionName: "balance" as const,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const phase3Contracts = [
    ...perMemberContracts,
    ...payoutOrderContracts,
    insuranceContract,
  ] as any;

  const phase3 = useReadContracts({
    contracts: phase3Contracts,
    query: {
      enabled: allAddrsLoaded,
      refetchInterval: 4000,
      staleTime: 2000,
      placeholderData: keepPreviousData,
    },
  });

  // ── Parse phase 3 results ────────────────────────────────────────
  const perMemberSlotCount = 5;
  const payoutOrderOffset = memberCount * perMemberSlotCount;
  const poolBalanceOffset = payoutOrderOffset + memberCount;

  // payoutOrder[s] = memberIndex at slot s
  const payoutOrder: number[] = memberIndexes.map((s) => {
    const r = phase3.data?.[payoutOrderOffset + s];
    return r?.status === "success" ? Number(r.result as bigint) : s;
  });

  // Reverse map: memberIndex → slot
  const memberSlotMap = new Map<number, number>();
  payoutOrder.forEach((memberIdx, slot) => {
    memberSlotMap.set(memberIdx, slot);
  });

  const members: Member[] = memberIndexes.map((i) => {
    const base = i * perMemberSlotCount;
    const collateral =
      phase3.data?.[base]?.status === "success"
        ? (phase3.data[base].result as bigint)
        : 0n;
    const score =
      phase3.data?.[base + 1]?.status === "success"
        ? Number(phase3.data[base + 1].result as bigint)
        : 0;
    const contributed =
      phase3.data?.[base + 2]?.status === "success"
        ? Boolean(phase3.data[base + 2].result)
        : false;
    const atRisk =
      phase3.data?.[base + 3]?.status === "success"
        ? Boolean(phase3.data[base + 3].result)
        : false;
    const hasDefaulted =
      phase3.data?.[base + 4]?.status === "success"
        ? Boolean(phase3.data[base + 4].result)
        : false;
    const slot = memberSlotMap.get(i) ?? i;

    return {
      address: memberAddrs[i],
      index: i,
      score,
      collateral,
      contributed,
      atRisk,
      hasDefaulted,
      slot,
    };
  });

  // Next recipient: member at payoutOrder[currentRound]
  const nextRecipientIndex = payoutOrder[currentRound];
  const nextRecipient =
    nextRecipientIndex !== undefined && memberAddrs[nextRecipientIndex]
      ? memberAddrs[nextRecipientIndex]
      : undefined;

  const poolBalance =
    phase3.data?.[poolBalanceOffset]?.status === "success"
      ? (phase3.data[poolBalanceOffset].result as bigint)
      : 0n;

  const loading =
    !isValid ||
    phase1.isLoading ||
    (memberCount > 0 && phase2.isLoading) ||
    (allAddrsLoaded && phase3.isLoading);

  const errorMsg =
    phase1.error?.message ||
    phase2.error?.message ||
    phase3.error?.message ||
    undefined;

  const refetch = useCallback(async () => {
    await Promise.all([
      phase1.refetch().catch(() => {}),
      phase2.refetch().catch(() => {}),
      phase3.refetch().catch(() => {}),
    ]);
  }, [phase1, phase2, phase3]);

  return {
    loading,
    error: errorMsg,
    contributionAmount,
    pot: contributionAmount * BigInt(memberCount || 0),
    currentRound,
    roundsTotal: memberCount,
    state: stateVal,
    members,
    nextRecipient,
    poolBalance,
    refetch,
  };
}
