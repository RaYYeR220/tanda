import { defineChain } from "viem";
import { arbitrumSepolia } from "viem/chains";

export const anvil = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

/** Flip the whole app between local anvil and Arbitrum Sepolia with one env var. */
export const activeChain =
  process.env.NEXT_PUBLIC_CHAIN === "arbitrumSepolia" ? arbitrumSepolia : anvil;
