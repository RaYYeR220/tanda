import { createPublicClient, http, type PublicClient } from "viem";
import { activeChain, rpcUrl } from "./chain";

/**
 * Server-side viem client used by the /api/underwrite route to read the TRUSTED on-chain
 * state (reputation, collateral, contribution status) directly — never trusting client input.
 */
export function serverClient(): PublicClient {
  return createPublicClient({
    chain: activeChain,
    transport: http(rpcUrl),
  });
}
