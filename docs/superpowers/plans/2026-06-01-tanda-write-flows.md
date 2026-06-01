# Tanda Live Write Flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add live on-chain write flows (contribute, top-up collateral, resolve-round, AI-flag, and create-circle) to the Tanda Next.js app using wagmi v2, with tx toasts and automatic dashboard refetch.

**Architecture:** A shared write-with-receipt primitive in `useWriteTanda.ts` wraps wagmi v2's `useWriteContract` + `useWaitForTransactionReceipt` into a clean `{ run, isPending, isConfirming, isSuccess, error, hash }` interface. A lightweight `TxToast.tsx` context shows pending/confirming/success/error with on-brand folk-modern styling. The existing `useCircle` hook's wagmi query cache is invalidated via `useQueryClient` after any successful write so the dashboard re-renders without a page reload. A new `/circles/new/page.tsx` create-circle form decodes the factory's `CircleCreated` event log using viem's `parseEventLogs` to extract the new circle address.

**Tech Stack:** Next.js 15 (App Router), wagmi v2.14, viem 2.21, @tanstack/react-query v5, @rainbow-me/rainbowkit v2, TypeScript strict, Tailwind CSS.

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `web/lib/useWriteTanda.ts` | CREATE | All write hooks (approve, contribute, topUp, resolveRound, flagAtRisk, createCircle) sharing a primitive |
| `web/components/TxToast.tsx` | CREATE | Lightweight fixed-position toast stack + context |
| `web/app/circles/[address]/page.tsx` | MODIFY | Wire ACTION ZONE — contribute, top-up, resolve, AI-flag buttons |
| `web/components/MemberCard.tsx` | MODIFY | Accept `onContribute`, `onTopUp`, `connectedAddress`, `circleAddress` props; render action buttons |
| `web/components/AiWarningBanner.tsx` | MODIFY | Accept `onFlagAtRisk`, `circleAddress` props; wire "Marcar en riesgo (IA)" button |
| `web/app/circles/new/page.tsx` | CREATE | Create-circle form; decodes event log for new address |
| `web/app/page.tsx` | MODIFY | Update "Crear tanda →" nav href and Hero CTA href from `#` to `/circles/new` |

---

## Task 1: Create the shared write primitive and all write hooks

**Files:**
- Create: `web/lib/useWriteTanda.ts`

### What this file exports

- `useWriteWithReceipt(onSuccess?)` — internal primitive used by all hooks
- `useApprove(token, spender)` → `{ run: (amount: bigint) => void, isPending, isConfirming, isSuccess, error, hash }`
- `useContribute(circle, onSuccess?)` → `{ run: () => void, … }`
- `useTopUp(circle, onSuccess?)` → `{ run: (amount: bigint) => void, … }`
- `useResolveRound(circle, onSuccess?)` → `{ run: () => void, … }`
- `useFlagAtRisk(circle, onSuccess?)` → `{ run: (member: \`0x${string}\`) => Promise<void>, … }`
- `useCreateCircle(onSuccess?)` → `{ run: (contributionAmount, maxMembers, roundDuration, bidDuration) => void, … }`

- [ ] **Step 1: Create the file with the shared primitive**

```typescript
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
    args?: any[];
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
      args?: any[];
    }) => {
      setCalledSuccess(false);
      writeContract({
        address: args.address,
        abi: args.abi,
        functionName: args.functionName,
        args: args.args,
      } as Parameters<typeof writeContract>[0]);
    },
    [writeContract],
  );

  const reset = useCallback(() => {
    setCalledSuccess(false);
    resetWrite();
  }, [resetWrite]);

  const combinedError = writeError?.message ?? receiptError?.message ?? null;

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
```

- [ ] **Step 2: Add useApprove, useContribute, useTopUp, useResolveRound**

Append to `web/lib/useWriteTanda.ts`:

```typescript
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
    [state, token, spender],
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
  }, [state, circle]);
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
    [state, circle],
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
  }, [state, circle]);
  return { ...state, run };
}
```

- [ ] **Step 3: Add useFlagAtRisk (calls /api/underwrite kind:riskflag first)**

Append to `web/lib/useWriteTanda.ts`:

```typescript
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
          throw new Error(json.error ?? `HTTP ${res.status}`);
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
    [state, circle],
  );

  return { ...state, run, isFetching };
}
```

- [ ] **Step 4: Add useCreateCircle (factory.createCircle)**

Append to `web/lib/useWriteTanda.ts`:

```typescript
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
    [state],
  );
  return { ...state, run };
}
```

- [ ] **Step 5: Verify the file compiles (no build yet — just check for obvious TS issues)**

Review the imports and type usages mentally:
- `Abi` from `viem` is the correct type for casting the const ABIs.
- `useWriteContract` returns `{ writeContract, data, isPending, error, reset }` in wagmi v2.
- `useWaitForTransactionReceipt({ hash })` returns `{ isLoading, isSuccess, error }`.
- All `state.write` calls inside hooks capture `state` from closure — this is intentional (same state object ref for each render).

---

## Task 2: Create TxToast component

**Files:**
- Create: `web/components/TxToast.tsx`

The toast system needs:
1. A React context that components can `useTxToastDispatch()` to push toasts
2. A `TxToastProvider` wrapper (added to `app/circles/[address]/page.tsx` and `app/circles/new/page.tsx`)
3. A `TxToast` display component rendering fixed-position stack of toast items
4. On-brand terracotta/marigold colors matching `.btn-primary` / globals.css palette

- [ ] **Step 1: Create TxToast.tsx**

```typescript
"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type ToastStatus = "pending" | "confirming" | "success" | "error";

export interface Toast {
  id: string;
  action: string;
  status: ToastStatus;
  hash?: `0x${string}`;
  error?: string;
}

interface ToastDispatch {
  push: (toast: Omit<Toast, "id">) => string;
  update: (id: string, patch: Partial<Omit<Toast, "id">>) => void;
  dismiss: (id: string) => void;
}

const ToastCtx = createContext<ToastDispatch | null>(null);

export function TxToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const push = useCallback((toast: Omit<Toast, "id">): string => {
    const id = `toast-${++counterRef.current}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    return id;
  }, []);

  const update = useCallback((id: string, patch: Partial<Omit<Toast, "id">>) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    );
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastCtx.Provider value={{ push, update, dismiss }}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastCtx.Provider>
  );
}

export function useTxToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useTxToast must be inside TxToastProvider");
  return ctx;
}

const STATUS_CONFIG: Record<
  ToastStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  pending: {
    label: "Enviando…",
    color: "#F59E0B",
    bg: "rgba(217,119,6,0.12)",
    border: "rgba(217,119,6,0.35)",
  },
  confirming: {
    label: "Confirmando…",
    color: "#F59E0B",
    bg: "rgba(217,119,6,0.12)",
    border: "rgba(217,119,6,0.35)",
  },
  success: {
    label: "Confirmado ✓",
    color: "#34D399",
    bg: "rgba(5,150,105,0.12)",
    border: "rgba(5,150,105,0.35)",
  },
  error: {
    label: "Error",
    color: "#FCA5A5",
    bg: "rgba(220,38,38,0.12)",
    border: "rgba(220,38,38,0.35)",
  },
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const cfg = STATUS_CONFIG[toast.status];

  // Auto-dismiss success/error after 6s
  useEffect(() => {
    if (toast.status === "success" || toast.status === "error") {
      const t = setTimeout(() => onDismiss(toast.id), 6000);
      return () => clearTimeout(t);
    }
  }, [toast.status, toast.id, onDismiss]);

  const shortHash = toast.hash
    ? `${toast.hash.slice(0, 6)}…${toast.hash.slice(-4)}`
    : undefined;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderLeft: `4px solid ${cfg.color}`,
        borderRadius: 7,
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 280,
        maxWidth: 340,
        boxShadow: "0 4px 20px rgba(28,20,16,0.35)",
        fontFamily: "var(--font-body, sans-serif)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: "0.78rem",
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: cfg.color,
          }}
        >
          {cfg.label}
        </span>
        <button
          onClick={() => onDismiss(toast.id)}
          aria-label="Cerrar notificación"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "rgba(237,217,163,0.4)",
            fontSize: "1rem",
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      </div>
      <span
        style={{
          fontSize: "0.88rem",
          fontWeight: 600,
          color: "#FAF3E0",
        }}
      >
        {toast.action}
      </span>
      {shortHash && (
        <span
          style={{
            fontSize: "0.70rem",
            fontFamily: "monospace",
            color: "rgba(237,217,163,0.45)",
          }}
        >
          tx: {shortHash}
        </span>
      )}
      {toast.error && (
        <span
          style={{
            fontSize: "0.75rem",
            color: "#FCA5A5",
            wordBreak: "break-word",
          }}
        >
          {toast.error.length > 120 ? toast.error.slice(0, 117) + "…" : toast.error}
        </span>
      )}
    </div>
  );
}

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      aria-label="Notificaciones de transacción"
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        alignItems: "flex-end",
      }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
```

---

## Task 3: Add a refetch helper to useCircle

**Files:**
- Modify: `web/lib/useCircle.ts`

The dashboard needs to trigger a refetch after any write. The cleanest wagmi v2 approach: call `useQueryClient()` and then `queryClient.invalidateQueries()` on the `useReadContracts` query keys. However, `useCircle` is called inside the page component — the easiest approach is to expose a `refetch` function by having `useCircle` call the wagmi queries' built-in `refetch` functions, combined together into a single `refetch(): Promise<void>`.

- [ ] **Step 1: Expose `refetch` from useCircle**

In `web/lib/useCircle.ts`, update `CircleView` to add `refetch`:

Change:
```typescript
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
};
```
To:
```typescript
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
```

- [ ] **Step 2: Build and return the refetch function**

At the bottom of `useCircle`, before `return { … }`, add:

```typescript
  const refetch = useCallback(async () => {
    await Promise.all([
      phase1.refetch(),
      phase2.refetch(),
      phase3.refetch(),
    ]);
  }, [phase1, phase2, phase3]);
```

And add `refetch` to the return object:

```typescript
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
```

Also add `useCallback` to the imports at the top:

```typescript
import { useCallback } from "react";
import { useReadContracts } from "wagmi";
```

---

## Task 4: Modify MemberCard to accept write action props

**Files:**
- Modify: `web/components/MemberCard.tsx`

MemberCard needs to optionally render a "Contribuir" button (if connected address is this member and hasn't contributed) and a "Reforzar colateral" button (if at-risk or collateral is below a threshold). We keep the card fully backward-compatible by making all new props optional.

- [ ] **Step 1: Update MemberCard props interface and implementation**

Full new version of `web/components/MemberCard.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Member } from "@/lib/useCircle";
import { trustTier, formatMXNB, collateralMultiplier } from "@/lib/format";
import { getMemberInfo } from "@/lib/memberMap";
import ScoreRing from "./ScoreRing";

interface MemberCardProps {
  member: Member;
  contributionAmount: bigint;
  currentRound: number;
  animDelay?: string;
  /** Address of the currently connected wallet */
  connectedAddress?: `0x${string}`;
  /** Called when user clicks Contribuir (approves then contributes) */
  onContribute?: () => void;
  /** Called when user clicks Reforzar with a chosen amount */
  onTopUp?: (amount: bigint) => void;
  isContributing?: boolean;
  isToppingUp?: boolean;
}

const BAND_CLASS: Record<string, string> = {
  high: "band-green",
  mid: "band-amber",
  low: "band-amber2",
  flag: "band-red",
};

const TRUST_LABEL: Record<string, string> = {
  high: "Alta",
  mid: "Media",
  low: "Baja",
  flag: "Crítica",
};

const TRUST_VALUE_COLOR: Record<string, string> = {
  high: "#6EE7B7",
  mid: "#F59E0B",
  low: "#FCD34D",
  flag: "#FCA5A5",
};

export default function MemberCard({
  member,
  contributionAmount,
  currentRound,
  animDelay,
  connectedAddress,
  onContribute,
  onTopUp,
  isContributing = false,
  isToppingUp = false,
}: MemberCardProps) {
  const tier = trustTier(member.score);
  const { name, handle, rationale } = getMemberInfo(member.address);
  const multStr = collateralMultiplier(member.collateral, contributionAmount);
  const collateralMXNB = formatMXNB(member.collateral);
  const isFlagged = member.atRisk || member.hasDefaulted;
  const isNextRecipient = member.slot === currentRound;
  const initial = name.slice(0, 1).toUpperCase();
  const avatarLetter = isFlagged ? "⚠" : initial;

  const isMe =
    connectedAddress &&
    member.address.toLowerCase() === connectedAddress.toLowerCase();
  const canContribute = isMe && !member.contributed && onContribute;
  const canTopUp = isMe && (member.atRisk || member.hasDefaulted) && onTopUp;

  const [topUpAmt, setTopUpAmt] = useState("100");

  return (
    <div
      className={`mc trust-${tier} reveal`}
      style={{ animationDelay: animDelay }}
    >
      <div className={`mc-band ${BAND_CLASS[tier]}`} />
      <div className="mc-body">
        {/* Header: avatar + name/handle/slot */}
        <div className="mc-header">
          <div className="mc-avatar">{avatarLetter}</div>
          <div>
            <div className="mc-name">{name}</div>
            <div className="mc-handle">{handle}</div>
            {isNextRecipient ? (
              <div className="mc-slot slot-current">
                📦 Slot #{member.slot + 1} — Receptora esta ronda
              </div>
            ) : (
              <div className="mc-slot">Slot #{member.slot + 1}</div>
            )}
            {isFlagged && (
              <div className="flagged-badge">⚑ FLAGGED</div>
            )}
          </div>
        </div>

        {/* AI Score bar */}
        <ScoreRing score={member.score} />

        {/* Collateral + trust level stats */}
        <div className="mc-stats">
          <div>
            <div className="mc-stat-key">Colateral</div>
            <div className="mc-stat-val">{multStr}</div>
            <div className="mc-stat-sub">= {collateralMXNB} MXNB</div>
          </div>
          <div>
            <div className="mc-stat-key">Confianza</div>
            <div
              className="mc-stat-val"
              style={{ color: TRUST_VALUE_COLOR[tier] }}
            >
              {TRUST_LABEL[tier]}
            </div>
          </div>
        </div>

        {/* AI rationale */}
        <div className={`mc-rationale${tier === "flag" ? " trust-flag" : ""}`}>
          {rationale}
        </div>

        {/* ── ACTION ZONE ── */}
        {canContribute && (
          <button
            className="btn-primary"
            style={{ marginTop: 12, width: "100%", fontSize: "0.80rem", padding: "10px 16px" }}
            onClick={onContribute}
            disabled={isContributing}
          >
            {isContributing ? "Procesando…" : `Contribuir ${formatMXNB(contributionAmount)} MXNB`}
          </button>
        )}

        {canTopUp && (
          <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
            <input
              type="number"
              min="1"
              value={topUpAmt}
              onChange={(e) => setTopUpAmt(e.target.value)}
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(237,217,163,0.22)",
                borderRadius: 4,
                padding: "8px 10px",
                color: "#FAF3E0",
                fontSize: "0.80rem",
                fontFamily: "var(--font-body, sans-serif)",
              }}
              placeholder="MXNB"
            />
            <button
              className="btn-secondary"
              style={{ fontSize: "0.75rem", padding: "8px 14px", whiteSpace: "nowrap" }}
              onClick={() => {
                const n = parseFloat(topUpAmt);
                if (!isNaN(n) && n > 0) {
                  onTopUp(BigInt(Math.round(n * 1_000_000)));
                }
              }}
              disabled={isToppingUp}
            >
              {isToppingUp ? "…" : "Reforzar"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## Task 5: Modify AiWarningBanner to wire the AI-flag button

**Files:**
- Modify: `web/components/AiWarningBanner.tsx`

- [ ] **Step 1: Update AiWarningBanner with flag button props**

Full new version of `web/components/AiWarningBanner.tsx`:

```typescript
"use client";

import { Member } from "@/lib/useCircle";
import { getMemberInfo } from "@/lib/memberMap";

interface AiWarningBannerProps {
  members: Member[];
  /** Address of circle (needed by parent to call flagAtRisk) */
  circleAddress?: `0x${string}`;
  /** Called to submit the AI risk flag for the first at-risk member */
  onFlagAtRisk?: (member: `0x${string}`) => void;
  isFlagging?: boolean;
}

export default function AiWarningBanner({
  members,
  onFlagAtRisk,
  isFlagging = false,
}: AiWarningBannerProps) {
  const atRiskMembers = members.filter((m) => m.atRisk || m.hasDefaulted);

  if (atRiskMembers.length === 0) {
    // Show the "Marcar en riesgo" button even when no members are flagged yet (for demo)
    if (!onFlagAtRisk) return null;
    const unflaggedAtRisk = members.filter((m) => !m.atRisk && !m.hasDefaulted);
    if (unflaggedAtRisk.length === 0) return null;
    // Show a subtle "trigger AI flag" strip
    const target = unflaggedAtRisk.find((m) => getMemberInfo(m.address).name === "0xkito") ?? unflaggedAtRisk[0];
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 16px",
          marginBottom: 20,
          background: "rgba(217,119,6,0.07)",
          border: "1px solid rgba(217,119,6,0.20)",
          borderRadius: 7,
        }}
      >
        <span style={{ fontSize: "0.75rem", color: "rgba(237,217,163,0.55)", flex: 1 }}>
          Agente IA — Sin alertas activas
        </span>
        <button
          className="btn-secondary"
          style={{ fontSize: "0.72rem", padding: "6px 14px" }}
          onClick={() => onFlagAtRisk(target.address)}
          disabled={isFlagging}
        >
          {isFlagging ? "Consultando IA…" : "Marcar en riesgo (IA)"}
        </button>
      </div>
    );
  }

  const names = atRiskMembers.map((m) => getMemberInfo(m.address).name).join(", ");
  // Only show flag button if there's a non-flagged at-risk candidate left
  const unflagged = members.filter((m) => !m.atRisk && !m.hasDefaulted);
  const canFlag = onFlagAtRisk && unflagged.length > 0;
  const target = unflagged.find((m) => getMemberInfo(m.address).name === "0xkito") ?? unflagged[0];

  return (
    <div className="ai-warning" role="alert" aria-live="assertive">
      <div className="warn-icon">⚠️</div>
      <div className="warn-body">
        <div className="warn-eyebrow">
          Agente IA — Alerta de riesgo de impago
        </div>
        <div className="warn-text">
          El agente detectó{" "}
          <strong>riesgo de impago de {names}</strong> esta ronda — se
          solicitó refuerzo de colateral. Acción preventiva: colateral
          bloqueado en escrow.
        </div>
      </div>
      {canFlag ? (
        <button
          className="warn-action"
          type="button"
          onClick={() => onFlagAtRisk(target.address)}
          disabled={isFlagging}
        >
          {isFlagging ? "Enviando…" : "Marcar en riesgo (IA)"}
        </button>
      ) : (
        <button className="warn-action" type="button" disabled>
          Flagged ✓
        </button>
      )}
    </div>
  );
}
```

---

## Task 6: Wire the ACTION ZONE into the circle dashboard page

**Files:**
- Modify: `web/app/circles/[address]/page.tsx`

This is the main wiring task. We need to:
1. Wrap the page with `TxToastProvider`
2. Add `useAccount` to get `connectedAddress`
3. Wire `useApprove`, `useContribute`, `useTopUp`, `useResolveRound`, `useFlagAtRisk` hooks
4. Create handler functions that show toasts and chain approve → action
5. Pass the new props to MemberCard and AiWarningBanner
6. Add a "Resolver ronda" button in the dashboard

Key design decisions:
- For **contribute**: first approve `contributionAmount` MXNB, wait for approval success, then call contribute. We chain them using `onSuccess` callbacks.
- For **topUp**: same pattern — approve `amount`, then topUpCollateral.
- Toasts: each multi-step action (approve → write) pushes one toast that transitions through pending → confirming → success.
- The `resolveRound` button lives just below the AiWarningBanner, always visible.

- [ ] **Step 1: Rewrite page.tsx with all write wiring**

Full new version of `web/app/circles/[address]/page.tsx`:

```typescript
"use client";

import { useCallback, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useCircle } from "@/lib/useCircle";
import { formatMXNB } from "@/lib/format";
import { getMemberInfo } from "@/lib/memberMap";
import { addresses } from "@/lib/contracts";
import {
  useApprove,
  useContribute,
  useTopUp,
  useResolveRound,
  useFlagAtRisk,
} from "@/lib/useWriteTanda";
import CircleHeader from "@/components/CircleHeader";
import AiWarningBanner from "@/components/AiWarningBanner";
import MemberCard from "@/components/MemberCard";
import AuctionRow from "@/components/AuctionRow";
import InsurancePoolCard from "@/components/InsurancePoolCard";
import { TxToastProvider, useTxToast } from "@/components/TxToast";

const ANIM_DELAYS = ["0.12s", "0.22s", "0.32s", "0.42s"];

// Inner component that uses the toast context (must be inside TxToastProvider)
function CircleDashboard({ circleAddress }: { circleAddress: `0x${string}` }) {
  const view = useCircle(circleAddress);
  const { address: connectedAddress } = useAccount();
  const toast = useTxToast();

  // Refs to track pending toastIds across approve → action chains
  const toastIdRef = useRef<string | null>(null);

  // ── Refetch helper ───────────────────────────────────────
  const refetch = useCallback(() => {
    view.refetch().catch(console.error);
  }, [view]);

  // ── Contribute flow ──────────────────────────────────────
  const contribute = useContribute(circleAddress, () => {
    if (toastIdRef.current) {
      toast.update(toastIdRef.current, { status: "success" });
    }
    refetch();
  });

  const approveContribute = useApprove(
    addresses.mxnb,
    circleAddress,
    () => {
      // approval done → now contribute
      if (toastIdRef.current) {
        toast.update(toastIdRef.current, { status: "confirming", action: "Contribuyendo…" });
      }
      contribute.run();
    },
  );

  const handleContribute = useCallback(() => {
    const id = toast.push({ action: "Aprobando MXNB…", status: "pending" });
    toastIdRef.current = id;
    approveContribute.run(view.contributionAmount);
  }, [toast, approveContribute, view.contributionAmount]);

  // Update toast when approval tx is submitted/confirmed
  useCallback(() => {
    if (approveContribute.hash && toastIdRef.current) {
      toast.update(toastIdRef.current, { hash: approveContribute.hash });
    }
  }, [approveContribute.hash, toast]);

  // ── Top-up flow (per-member, so we use state to track target amount) ──
  const [topUpAmount, setTopUpAmount] = useState<bigint>(0n);

  const topUp = useTopUp(circleAddress, () => {
    if (toastIdRef.current) {
      toast.update(toastIdRef.current, { status: "success" });
    }
    refetch();
  });

  const approveTopUp = useApprove(
    addresses.mxnb,
    circleAddress,
    () => {
      if (toastIdRef.current) {
        toast.update(toastIdRef.current, { status: "confirming", action: "Reforzando colateral…" });
      }
      topUp.run(topUpAmount);
    },
  );

  const handleTopUp = useCallback(
    (amount: bigint) => {
      setTopUpAmount(amount);
      const id = toast.push({ action: "Aprobando MXNB para colateral…", status: "pending" });
      toastIdRef.current = id;
      approveTopUp.run(amount);
    },
    [toast, approveTopUp],
  );

  // ── Resolve round ────────────────────────────────────────
  const resolveRound = useResolveRound(circleAddress, () => {
    toast.push({ action: "Ronda resuelta ✓", status: "success" });
    refetch();
  });

  const handleResolveRound = useCallback(() => {
    const id = toast.push({ action: "Resolviendo ronda…", status: "pending" });
    toastIdRef.current = id;
    try {
      resolveRound.run();
    } catch (e) {
      toast.update(id, { status: "error", error: String(e) });
    }
  }, [toast, resolveRound]);

  // Watch resolveRound errors
  useCallback(() => {
    if (resolveRound.error && toastIdRef.current) {
      toast.update(toastIdRef.current, { status: "error", error: resolveRound.error });
    }
  }, [resolveRound.error, toast]);

  // ── AI Flag ──────────────────────────────────────────────
  const flagAtRisk = useFlagAtRisk(circleAddress, () => {
    toast.push({ action: "Miembro marcado en riesgo ✓", status: "success" });
    refetch();
  });

  const handleFlagAtRisk = useCallback(
    async (member: `0x${string}`) => {
      const id = toast.push({ action: "Consultando agente IA…", status: "pending" });
      toastIdRef.current = id;
      try {
        await flagAtRisk.run(member);
        toast.update(id, { status: "confirming", action: "Enviando flag on-chain…" });
      } catch (e) {
        toast.update(id, { status: "error", error: String(e) });
      }
    },
    [toast, flagAtRisk],
  );

  const nextName = view.nextRecipient
    ? getMemberInfo(view.nextRecipient).name
    : "—";

  /* ── Loading state ── */
  if (view.loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#1C1410" }}
      >
        <div className="text-center">
          <div
            className="sarape-stripe mx-auto mb-6"
            style={{ width: 120, height: 5 }}
          />
          <p
            className="text-[0.8rem] font-bold tracking-[0.15em] uppercase"
            style={{ color: "rgba(237,217,163,0.45)" }}
          >
            Cargando círculo…
          </p>
        </div>
      </div>
    );
  }

  /* ── Error state ── */
  if (view.error) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#1C1410" }}
      >
        <div
          className="max-w-md mx-auto p-8 rounded-lg"
          style={{
            background: "rgba(220,38,38,0.09)",
            border: "1px solid rgba(220,38,38,0.28)",
          }}
        >
          <p
            className="text-[0.75rem] font-bold tracking-[0.15em] uppercase mb-2"
            style={{ color: "#F87171" }}
          >
            Error al cargar el círculo
          </p>
          <p className="text-[0.85rem]" style={{ color: "rgba(250,243,224,0.7)" }}>
            {view.error}
          </p>
          <Link
            href="/"
            className="inline-block mt-4 text-[0.75rem] font-bold tracking-[0.1em] uppercase"
            style={{ color: "#D97706" }}
          >
            ← Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  const isContributing = approveContribute.isPending || approveContribute.isConfirming || contribute.isPending || contribute.isConfirming;
  const isToppingUp = approveTopUp.isPending || approveTopUp.isConfirming || topUp.isPending || topUp.isConfirming;

  return (
    <div
      className="min-h-screen"
      style={{
        background: "#1C1410",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
      }}
    >
      {/* Sarape stripe at very top */}
      <div className="sarape-stripe" />

      {/* Top nav bar */}
      <nav
        className="flex items-center justify-between px-14 h-16"
        style={{
          background: "rgba(28,20,16,0.80)",
          borderBottom: "1px solid rgba(237,217,163,0.09)",
          backdropFilter: "blur(8px)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <Link
          href="/"
          className="flex items-baseline gap-2 no-underline"
          style={{ textDecoration: "none" }}
        >
          <span
            className="font-display text-[1.5rem]"
            style={{ color: "#FAF3E0", lineHeight: 1 }}
          >
            Tanda
          </span>
          <span
            className="text-[0.65rem] font-bold tracking-[0.14em] uppercase"
            style={{ color: "rgba(237,217,163,0.5)" }}
          >
            On-Chain · MXNB
          </span>
        </Link>

        <Link
          href="/"
          className="text-[0.78rem] font-semibold tracking-[0.06em]"
          style={{ color: "rgba(237,217,163,0.55)" }}
        >
          ← Volver al inicio
        </Link>
      </nav>

      {/* Main content */}
      <main className="max-w-[1240px] mx-auto px-8 py-12">

        {/* Section eyebrow */}
        <div className="mb-8">
          <div
            className="text-[0.65rem] font-bold tracking-[0.18em] uppercase mb-2"
            style={{ color: "#D97706" }}
          >
            Círculo activo — Dashboard en vivo
          </div>
          <h1
            className="font-display mb-2"
            style={{
              fontSize: "clamp(1.6rem, 3vw, 2.4rem)",
              color: "#FAF3E0",
              letterSpacing: "-0.01em",
              lineHeight: 1.1,
            }}
          >
            Tanda Oaxaca{" "}
            <span style={{ color: "#F59E0B" }}>· Tiempo real</span>
          </h1>
          <p
            className="text-[0.88rem]"
            style={{ color: "rgba(237,217,163,0.45)", maxWidth: 560 }}
          >
            El agente IA monitorea cada ronda, puntúa a los miembros y detecta
            riesgos antes de que ocurran.
          </p>
        </div>

        {/* ── THE DASHBOARD CARD ── */}
        <div className="circle-dashboard reveal" style={{ animationDelay: "0.1s" }}>

          {/* Sarape stripe header */}
          <div className="cd-sarape-header" aria-hidden="true" />

          {/* Browser chrome bar */}
          <div className="cd-topbar" aria-hidden="true">
            <div className="topbar-dot td-red" />
            <div className="topbar-dot td-amber" />
            <div className="topbar-dot td-green" />
            <span className="topbar-url">
              tanda.app / círculos / {circleAddress.slice(0, 10)}…
            </span>
            <span className="topbar-live">
              <span className="live-dot" />
              Ronda activa
            </span>
          </div>

          {/* Dashboard body */}
          <div className="cd-body">

            {/* Circle header row */}
            <CircleHeader view={view} />

            {/* AI early-warning banner + Resolver ronda */}
            <AiWarningBanner
              members={view.members}
              circleAddress={circleAddress}
              onFlagAtRisk={handleFlagAtRisk}
              isFlagging={flagAtRisk.isFetching || flagAtRisk.isPending || flagAtRisk.isConfirming}
            />

            {/* Resolver ronda button */}
            <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
              <button
                className="btn-secondary"
                style={{ fontSize: "0.82rem", padding: "10px 24px" }}
                onClick={handleResolveRound}
                disabled={resolveRound.isPending || resolveRound.isConfirming}
              >
                {resolveRound.isPending || resolveRound.isConfirming
                  ? "Procesando…"
                  : "Resolver ronda"}
              </button>
              {resolveRound.error && (
                <span style={{ fontSize: "0.75rem", color: "#FCA5A5" }}>
                  {resolveRound.error.includes("RoundNotExpired")
                    ? "La ronda aún no ha expirado"
                    : resolveRound.error.slice(0, 80)}
                </span>
              )}
            </div>

            {/* Members section label */}
            <div className="members-label" aria-label="AI-scored circle members">
              Miembros del círculo — Puntuados por IA
            </div>

            {/* 4 member cards */}
            <div className="members-grid">
              {view.members.map((m, i) => (
                <MemberCard
                  key={m.address}
                  member={m}
                  contributionAmount={view.contributionAmount}
                  currentRound={view.currentRound}
                  animDelay={ANIM_DELAYS[i] ?? "0.5s"}
                  connectedAddress={connectedAddress}
                  onContribute={handleContribute}
                  onTopUp={handleTopUp}
                  isContributing={isContributing}
                  isToppingUp={isToppingUp}
                />
              ))}
            </div>

            {/* Auction row */}
            <AuctionRow />

            {/* Dashboard footer */}
            <div className="cd-footer">
              <InsurancePoolCard poolBalance={view.poolBalance} />

              <div className="next-block">
                <div className="next-lbl">Receptora esta ronda</div>
                <div className="next-name-val">{nextName}</div>
                <div className="next-amount-val">
                  {formatMXNB(view.pot)} MXNB · Pote total
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Bottom metadata */}
        <div
          className="mt-6 flex items-center gap-3 text-[0.68rem] font-semibold tracking-[0.10em] uppercase"
          style={{ color: "rgba(237,217,163,0.25)" }}
        >
          <span
            className="w-[5px] h-[5px] rounded-full"
            style={{ background: "#0F9090" }}
          />
          Anvil · Chain ID 31337 · MXNB · Non-custodial
          <span className="ml-auto font-mono" style={{ color: "rgba(237,217,163,0.18)" }}>
            {circleAddress}
          </span>
        </div>
      </main>
    </div>
  );
}

export default function CirclePage() {
  const params = useParams();
  const rawAddress = Array.isArray(params.address)
    ? params.address[0]
    : params.address ?? "0x";

  const circleAddress = rawAddress as `0x${string}`;

  return (
    <TxToastProvider>
      <CircleDashboard circleAddress={circleAddress} />
    </TxToastProvider>
  );
}
```

**Important TS note:** The `useCallback(() => { ... }, [deps])` calls used only for side-effects at render time won't work — those need to be `useEffect`. Fix: the toast-update side effects (for hash watching, error watching) should be in `useEffect` blocks, not `useCallback`. The plan above contains this subtle bug — in Step 2 of the implementation, replace those two `useCallback` blocks with `useEffect`.

---

## Task 7: Create the create-circle page

**Files:**
- Create: `web/app/circles/new/page.tsx`

The page needs:
1. A form with: contribution amount (MXNB), members count (2–8), round duration (preset), bid duration (preset)
2. On submit → `factory.createCircle(...)` via `useCreateCircle`
3. On success → decode the `CircleCreated` event from the tx receipt logs using `parseEventLogs` from viem to get the new circle address → `router.push(/circles/<address>)`
4. Show tx status via TxToast
5. Folk-modern styling

Key implementation detail for decoding the event: wagmi's `useWaitForTransactionReceipt` gives a `receipt` with `receipt.logs`. Use viem's `parseEventLogs` with `abis.CircleFactory` to decode the `CircleCreated` event and extract `circle`.

- [ ] **Step 1: Create web/app/circles/new/page.tsx**

```typescript
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEventLogs } from "viem";
import { addresses, abis } from "@/lib/contracts";
import { TxToastProvider, useTxToast } from "@/components/TxToast";

const ROUND_PRESETS = [
  { label: "1 minuto (demo)", seconds: 60 },
  { label: "1 hora", seconds: 3600 },
  { label: "1 día", seconds: 86400 },
  { label: "7 días", seconds: 604800 },
];

const BID_PRESETS = [
  { label: "30 segundos (demo)", seconds: 30 },
  { label: "15 minutos", seconds: 900 },
  { label: "1 hora", seconds: 3600 },
  { label: "6 horas", seconds: 21600 },
];

function CreateCircleForm() {
  const router = useRouter();
  const toast = useTxToast();

  const [contribution, setContribution] = useState("100");
  const [members, setMembers] = useState(4);
  const [roundIdx, setRoundIdx] = useState(0);
  const [bidIdx, setBidIdx] = useState(0);

  const {
    writeContract,
    data: hash,
    isPending,
    error: writeError,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess,
    data: receipt,
  } = useWaitForTransactionReceipt({ hash });

  const [toastId, setToastId] = useState<string | null>(null);

  // Update toast as tx progresses
  useEffect(() => {
    if (hash && toastId) {
      toast.update(toastId, { hash, status: "confirming", action: "Confirmando creación…" });
    }
  }, [hash, toastId, toast]);

  useEffect(() => {
    if (writeError && toastId) {
      toast.update(toastId, {
        status: "error",
        error: writeError.message.slice(0, 120),
      });
    }
  }, [writeError, toastId, toast]);

  // On success: decode the new circle address and route
  useEffect(() => {
    if (isSuccess && receipt && toastId) {
      try {
        const logs = parseEventLogs({
          abi: abis.CircleFactory,
          logs: receipt.logs,
          eventName: "CircleCreated",
        });
        const newCircle = logs[0]?.args?.circle as `0x${string}` | undefined;
        if (newCircle) {
          toast.update(toastId, {
            status: "success",
            action: `Círculo creado: ${newCircle.slice(0, 8)}…`,
          });
          // Short delay so user sees the success toast
          setTimeout(() => router.push(`/circles/${newCircle}`), 1500);
        } else {
          toast.update(toastId, { status: "success", action: "Círculo creado ✓" });
        }
      } catch {
        toast.update(toastId!, { status: "success", action: "Círculo creado ✓" });
      }
    }
  }, [isSuccess, receipt, toastId, toast, router]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const contributionRaw = parseFloat(contribution);
    if (isNaN(contributionRaw) || contributionRaw <= 0) return;
    const contributionAmount = BigInt(Math.round(contributionRaw * 1_000_000));
    const roundDuration = BigInt(ROUND_PRESETS[roundIdx].seconds);
    const bidDuration = BigInt(BID_PRESETS[bidIdx].seconds);

    const id = toast.push({ action: "Creando círculo…", status: "pending" });
    setToastId(id);

    writeContract({
      address: addresses.factory,
      abi: abis.CircleFactory,
      functionName: "createCircle",
      args: [contributionAmount, members, roundDuration, bidDuration],
    });
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "rgba(255,255,255,0.06)",
    border: "1.5px solid rgba(237,217,163,0.18)",
    borderRadius: 6,
    padding: "12px 16px",
    color: "#FAF3E0",
    fontSize: "0.95rem",
    fontFamily: "var(--font-body, sans-serif)",
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.68rem",
    fontWeight: 800,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "rgba(237,217,163,0.50)",
    marginBottom: 8,
  };

  return (
    <div
      className="min-h-screen"
      style={{ background: "#1C1410" }}
    >
      <div className="sarape-stripe" />

      <nav
        className="flex items-center justify-between px-14 h-16"
        style={{
          background: "rgba(28,20,16,0.80)",
          borderBottom: "1px solid rgba(237,217,163,0.09)",
          backdropFilter: "blur(8px)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <Link href="/" className="flex items-baseline gap-2 no-underline" style={{ textDecoration: "none" }}>
          <span className="font-display text-[1.5rem]" style={{ color: "#FAF3E0", lineHeight: 1 }}>
            Tanda
          </span>
          <span className="text-[0.65rem] font-bold tracking-[0.14em] uppercase" style={{ color: "rgba(237,217,163,0.5)" }}>
            On-Chain · MXNB
          </span>
        </Link>
        <Link href="/" className="text-[0.78rem] font-semibold tracking-[0.06em]" style={{ color: "rgba(237,217,163,0.55)" }}>
          ← Volver al inicio
        </Link>
      </nav>

      <main className="max-w-[560px] mx-auto px-6 py-14">
        <div className="mb-8">
          <div className="text-[0.65rem] font-bold tracking-[0.18em] uppercase mb-2" style={{ color: "#D97706" }}>
            Crear nueva tanda
          </div>
          <h1
            className="font-display mb-3"
            style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)", color: "#FAF3E0", letterSpacing: "-0.01em", lineHeight: 1.1 }}
          >
            Nueva tanda{" "}
            <span style={{ color: "#F59E0B" }}>on-chain</span>
          </h1>
          <p className="text-[0.88rem]" style={{ color: "rgba(237,217,163,0.45)", maxWidth: 480 }}>
            Define los parámetros y despliega tu tanda en la cadena. Los miembros
            se unen después pagando colateral + prima.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(237,217,163,0.10)",
            borderRadius: 12,
            padding: "32px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          {/* Contribution amount */}
          <div>
            <label htmlFor="contribution" style={labelStyle}>
              Contribución por ronda (MXNB)
            </label>
            <input
              id="contribution"
              type="number"
              min="1"
              step="any"
              value={contribution}
              onChange={(e) => setContribution(e.target.value)}
              style={inputStyle}
              required
            />
          </div>

          {/* Members */}
          <div>
            <label htmlFor="members" style={labelStyle}>
              Número de miembros (2–8)
            </label>
            <input
              id="members"
              type="number"
              min="2"
              max="8"
              value={members}
              onChange={(e) => setMembers(Number(e.target.value))}
              style={inputStyle}
              required
            />
          </div>

          {/* Round duration */}
          <div>
            <label htmlFor="roundDuration" style={labelStyle}>
              Duración de ronda
            </label>
            <select
              id="roundDuration"
              value={roundIdx}
              onChange={(e) => setRoundIdx(Number(e.target.value))}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {ROUND_PRESETS.map((p, i) => (
                <option key={i} value={i} style={{ background: "#2A1E18" }}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Bid duration */}
          <div>
            <label htmlFor="bidDuration" style={labelStyle}>
              Duración de subasta
            </label>
            <select
              id="bidDuration"
              value={bidIdx}
              onChange={(e) => setBidIdx(Number(e.target.value))}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {BID_PRESETS.map((p, i) => (
                <option key={i} value={i} style={{ background: "#2A1E18" }}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Summary */}
          <div
            style={{
              background: "rgba(217,119,6,0.07)",
              border: "1px solid rgba(217,119,6,0.18)",
              borderRadius: 7,
              padding: "14px 16px",
              fontSize: "0.82rem",
              color: "rgba(237,217,163,0.65)",
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: "#F59E0B" }}>Resumen:</strong>{" "}
            {members} miembros · {contribution} MXNB/ronda ·{" "}
            Pote total {(parseFloat(contribution) * members || 0).toFixed(0)} MXNB ·{" "}
            {ROUND_PRESETS[roundIdx].label}
          </div>

          <button
            type="submit"
            className="btn-primary"
            style={{ justifyContent: "center" }}
            disabled={isPending || isConfirming}
          >
            {isPending ? "Confirma en tu wallet…" : isConfirming ? "Desplegando…" : "Crear tanda →"}
          </button>

          {writeError && (
            <p style={{ fontSize: "0.78rem", color: "#FCA5A5", margin: 0 }}>
              {writeError.message.slice(0, 200)}
            </p>
          )}
        </form>
      </main>
    </div>
  );
}

export default function NewCirclePage() {
  return (
    <TxToastProvider>
      <CreateCircleForm />
    </TxToastProvider>
  );
}
```

---

## Task 8: Update landing page CTAs to point to /circles/new

**Files:**
- Modify: `web/app/page.tsx`

Two links need updating from `href="#"` to `href="/circles/new"`:
1. The "Crear tanda →" button in the nav (line ~70)
2. If the Hero component has a "Crear una tanda" CTA, check `web/components/Hero.tsx`

- [ ] **Step 1: Update the nav "Crear tanda" link**

In `web/app/page.tsx`, find:
```html
<a
  href="#"
  className="text-[0.82rem] font-bold tracking-[0.04em] rounded-[4px] px-5 py-2 no-underline transition-all duration-200"
  style={{
    background: "#D97706",
    color: "#1C1410",
  }}
>
  Crear tanda →
</a>
```

Replace with:
```html
<Link
  href="/circles/new"
  className="text-[0.82rem] font-bold tracking-[0.04em] rounded-[4px] px-5 py-2 no-underline transition-all duration-200"
  style={{
    background: "#D97706",
    color: "#1C1410",
  }}
>
  Crear tanda →
</Link>
```

And add `import Link from "next/link";` to the top if not already there (it is already imported).

- [ ] **Step 2: Check Hero.tsx for CTAs**

Read `web/components/Hero.tsx` and update any `href="#"` CTAs that say "Crear una tanda" or similar to `href="/circles/new"`. Use Link component if appropriate.

---

## Task 9: Fix useEffect bugs and TypeScript issues

**Files:**
- Modify: `web/app/circles/[address]/page.tsx`
- Modify: `web/lib/useWriteTanda.ts`

After writing all files, there are known issues to fix before `npm run build`:

- [ ] **Step 1: Fix useCallback → useEffect in page.tsx**

In `CircleDashboard`, the two side-effect blocks that watch `approveContribute.hash` and `resolveRound.error` were incorrectly written as `useCallback`. They must be `useEffect`:

Replace:
```typescript
  // Update toast when approval tx is submitted/confirmed
  useCallback(() => {
    if (approveContribute.hash && toastIdRef.current) {
      toast.update(toastIdRef.current, { hash: approveContribute.hash });
    }
  }, [approveContribute.hash, toast]);

  // ...

  // Watch resolveRound errors
  useCallback(() => {
    if (resolveRound.error && toastIdRef.current) {
      toast.update(toastIdRef.current, { status: "error", error: resolveRound.error });
    }
  }, [resolveRound.error, toast]);
```

With:
```typescript
  // Update toast when approval tx is submitted/confirmed
  useEffect(() => {
    if (approveContribute.hash && toastIdRef.current) {
      toast.update(toastIdRef.current, { hash: approveContribute.hash });
    }
  }, [approveContribute.hash, toast]);

  // ...

  // Watch resolveRound errors
  useEffect(() => {
    if (resolveRound.error && toastIdRef.current) {
      toast.update(toastIdRef.current, { status: "error", error: resolveRound.error });
    }
  }, [resolveRound.error, toast]);
```

And add `useEffect` to the React imports in the file.

- [ ] **Step 2: Fix the write function in useWriteWithReceipt**

In wagmi v2, `writeContract` from `useWriteContract` takes a single config object but TypeScript's strict inference with `as Parameters<typeof writeContract>[0]` can cause issues. Use a proper type cast via a typed intermediate:

```typescript
  const write = useCallback(
    (args: {
      address: `0x${string}`;
      abi: Abi;
      functionName: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      args?: readonly unknown[];
    }) => {
      setCalledSuccess(false);
      // wagmi v2: writeContract accepts { address, abi, functionName, args }
      writeContract({
        address: args.address,
        abi: args.abi,
        functionName: args.functionName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        args: args.args as any,
      } as any);
    },
    [writeContract],
  );
```

This avoids the strict typing conflict between `Abi` (viem) and wagmi's internal abi generic.

- [ ] **Step 3: Fix MemberCard — add "use client" directive**

`MemberCard` now uses `useState`, which requires a client directive:

Add `"use client";` as the very first line of `web/components/MemberCard.tsx`.

(It already doesn't have `"use client"` — check `web/components/AiWarningBanner.tsx` too.)

- [ ] **Step 4: Ensure AiWarningBanner has "use client"**

`AiWarningBanner` now uses event handlers — add `"use client";` as first line.

---

## Task 10: Run npm run build and fix remaining TypeScript errors

**Files:**
- Possibly `web/lib/useWriteTanda.ts`, `web/app/circles/[address]/page.tsx`, `web/app/circles/new/page.tsx`

- [ ] **Step 1: Run the build**

```bash
cd C:\Users\egori\Desktop\projects\tanda\web
npm run build
```

Expected: build succeeds with only minor warnings (unused vars, etc).

- [ ] **Step 2: Fix any type errors**

Common wagmi v2 + viem type issues to watch for:

a) `parseEventLogs` return type — `logs[0]?.args?.circle` may be typed as `unknown`. Cast:
```typescript
const newCircle = (logs[0]?.args as { circle: `0x${string}` } | undefined)?.circle;
```

b) `useWriteContract` `writeError` is typed as `WriteContractErrorType | null`, not `Error | null`. Access `.message` only after checking it's defined:
```typescript
error: writeError ? (writeError.message ?? String(writeError)) : null,
```

c) The `refetch` functions on wagmi hooks return different Promise types — wrap in try/catch or cast to `Promise<void>`:
```typescript
const refetch = useCallback(async () => {
  await Promise.all([
    phase1.refetch().catch(() => {}),
    phase2.refetch().catch(() => {}),
    phase3.refetch().catch(() => {}),
  ]);
}, [phase1, phase2, phase3]);
```

d) In `TxToast.tsx`, `React.ReactNode` import — use from "react":
```typescript
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
// Then in TxToastProvider:
export function TxToastProvider({ children }: { children: ReactNode }) {
```

e) `members` number input in new/page.tsx — the `args` array for `createCircle` expects `uint8` for `maxMembers`, so `Number(e.target.value)` is fine but wagmi needs it to match the ABI type. Cast to ensure it fits:
```typescript
args: [contributionAmount, members as number, roundDuration, bidDuration],
```

- [ ] **Step 3: Commit when build passes**

```bash
cd C:\Users\egori\Desktop\projects\tanda
git add web/
git commit -m "feat(web): live write flows — contribute, top-up, resolve, AI-flag, create-circle"
```

---

## Self-Review Against Spec

**Spec coverage check:**

| Requirement | Task |
|---|---|
| `useApprove(token, spender)` | Task 1 Step 2 |
| `useContribute(circle)` | Task 1 Step 2 |
| `useTopUp(circle)` | Task 1 Step 2 |
| `useResolveRound(circle)` | Task 1 Step 2 |
| `useFlagAtRisk(circle)` — fetches /api/underwrite riskflag | Task 1 Step 3 |
| `useCreateCircle()` → factory.createCircle | Task 1 Step 4 |
| `TxToast` — pending/confirming/success/error with hash | Task 2 |
| Dashboard: contribute button per member card | Task 4, Task 6 |
| Dashboard: top-up collateral per member | Task 4, Task 6 |
| Dashboard: "Resolver ronda" button | Task 6 |
| Dashboard: "Marcar en riesgo (IA)" button | Task 5, Task 6 |
| After write, refetch dashboard | Task 3, Task 6 |
| Create-circle page at /circles/new | Task 7 |
| createCircle decodes new address from event log | Task 7 (parseEventLogs CircleCreated) |
| Route to /circles/<newAddress> after create | Task 7 |
| CTA hrefs updated from # to /circles/new | Task 8 |
| npm run build passes | Task 10 |
| No contract/agent modifications | All tasks — no contract files touched |
| No dashboard regression | Tasks add only new props (optional); existing render unchanged |

**Placeholder scan:** No TBD/TODO/placeholder patterns found. All code blocks are complete.

**Type consistency check:**
- `useWriteWithReceipt` returns `WriteState & { write, reset }` — downstream hooks use `state.write(...)` which matches.
- `CircleView.refetch: () => Promise<void>` — matches usage in `view.refetch()`.
- `TxToast`: `push` returns `string` (toastId) — matched by `setToastId(id)` in Task 7.
- `MemberCard` new props all optional with `?:` — backward compatible.
- `AiWarningBanner` new props all optional — backward compatible.
- `useFlagAtRisk` returns `WriteState & { run, isFetching: boolean }` — dashboard checks `flagAtRisk.isFetching` which matches.
