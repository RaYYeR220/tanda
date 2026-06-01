"use client";

import { useState, useCallback, useEffect } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import type { Abi } from "viem";
import { addresses, abis } from "./contracts";

export type WriteState = {
  isPending: boolean;     // wallet prompt open / tx submitted
  isConfirming: boolean;  // tx in mempool, waiting for receipt
  isSuccess: boolean;
  error: string | null;
  hash: `0x${string}` | undefined;
  reset: () => void;
};

/** Internal primitive: wraps useWriteContract + useWaitForTransactionReceipt. */
export function useWriteWithReceipt(onSuccess?: () => void): WriteState & {
  write: (args: {
    address: `0x${string}`;
    abi: Abi;
    functionName: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args?: readonly unknown[];
  }) => void;
} {
  const { writeContract, data: hash, isPending, error: writeError, reset: resetWrite } = useWriteContract();

  const { isLoading: isConfirming, isSuccess, error: receiptError } = useWaitForTransactionReceipt({
    hash,
  });

  const [calledSuccess, setCalledSuccess] = useState(false);

  useEffect(() => {
    if (isSuccess && !calledSuccess) {
      setCalledSuccess(true);
      onSuccess?.();
    }
  }, [isSuccess, calledSuccess, onSuccess]);

  const write = useCallback(
    (args: {
      address: `0x${string}`;
      abi: Abi;
      functionName: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      args?: readonly unknown[];
    }) => {
      setCalledSuccess(false);
      writeContract({
        address: args.address,
        abi: args.abi,
        functionName: args.functionName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        args: args.args as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    },
    [writeContract],
  );

  const reset = useCallback(() => {
    setCalledSuccess(false);
    resetWrite();
  }, [resetWrite]);

  const combinedError =
    (writeError ? (writeError.message ?? String(writeError)) : null) ??
    (receiptError ? (receiptError.message ?? String(receiptError)) : null);

  return {
    write,
    isPending,
    isConfirming,
    isSuccess,
    error: combinedError,
    hash,
    reset,
  };
}

/** Approve ERC-20 spend. */
export function useApprove(
  token: `0x${string}`,
  spender: `0x${string}`,
  onSuccess?: () => void,
): WriteState & { run: (amount: bigint) => void } {
  const state = useWriteWithReceipt(onSuccess);
  const run = useCallback(
    (amount: bigint) => {
      state.write({
        address: token,
        abi: abis.MockMXNB as Abi,
        functionName: "approve",
        args: [spender, amount],
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.write, token, spender],
  );
  return { ...state, run };
}

/** contribute() — caller must have approved contributionAmount first. */
export function useContribute(
  circle: `0x${string}`,
  onSuccess?: () => void,
): WriteState & { run: () => void } {
  const state = useWriteWithReceipt(onSuccess);
  const run = useCallback(() => {
    state.write({
      address: circle,
      abi: abis.TandaCircle as Abi,
      functionName: "contribute",
      args: [],
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.write, circle]);
  return { ...state, run };
}

/** topUpCollateral(amount) — caller must have approved ≥ amount first. */
export function useTopUp(
  circle: `0x${string}`,
  onSuccess?: () => void,
): WriteState & { run: (amount: bigint) => void } {
  const state = useWriteWithReceipt(onSuccess);
  const run = useCallback(
    (amount: bigint) => {
      state.write({
        address: circle,
        abi: abis.TandaCircle as Abi,
        functionName: "topUpCollateral",
        args: [amount],
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.write, circle],
  );
  return { ...state, run };
}

/** resolveRound() — callable by anyone after roundDeadline. */
export function useResolveRound(
  circle: `0x${string}`,
  onSuccess?: () => void,
): WriteState & { run: () => void } {
  const state = useWriteWithReceipt(onSuccess);
  const run = useCallback(() => {
    state.write({
      address: circle,
      abi: abis.TandaCircle as Abi,
      functionName: "resolveRound",
      args: [],
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.write, circle]);
  return { ...state, run };
}

/** Fetch a signed risk-flag from /api/underwrite then call flagAtRisk. */
export function useFlagAtRisk(
  circle: `0x${string}`,
  onSuccess?: () => void,
): WriteState & { run: (member: `0x${string}`) => Promise<void>; isFetching: boolean } {
  const state = useWriteWithReceipt(onSuccess);
  const [isFetching, setIsFetching] = useState(false);

  const run = useCallback(
    async (member: `0x${string}`) => {
      setIsFetching(true);
      try {
        const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
        const res = await fetch("/api/underwrite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "riskflag", circle, member, deadline }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({ error: "Unknown error" }));
          throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
        }
        const data = await res.json() as {
          rationaleHash: `0x${string}`;
          deadline: string;
          signature: `0x${string}`;
        };
        setIsFetching(false);
        state.write({
          address: circle,
          abi: abis.TandaCircle as Abi,
          functionName: "flagAtRisk",
          args: [member, data.rationaleHash, BigInt(data.deadline), data.signature],
        });
      } catch (err) {
        setIsFetching(false);
        throw err;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.write, circle],
  );

  return { ...state, run, isFetching };
}

/** createCircle(contributionAmount, maxMembers, roundDuration, bidDuration) */
export function useCreateCircle(
  onSuccess?: () => void,
): WriteState & {
  run: (
    contributionAmount: bigint,
    maxMembers: number,
    roundDuration: bigint,
    bidDuration: bigint,
  ) => void;
} {
  const state = useWriteWithReceipt(onSuccess);
  const run = useCallback(
    (
      contributionAmount: bigint,
      maxMembers: number,
      roundDuration: bigint,
      bidDuration: bigint,
    ) => {
      state.write({
        address: addresses.factory,
        abi: abis.CircleFactory as Abi,
        functionName: "createCircle",
        args: [contributionAmount, maxMembers, roundDuration, bidDuration],
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.write],
  );
  return { ...state, run };
}
