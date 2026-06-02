/** Local display-name / handle / AI rationale map keyed by lowercase address. */
export const MEMBER_MAP: Record<
  string,
  { name: string; handle: string; rationale: string }
> = {
  "0x70997970c51812dc3a010c7d01b50e0d17dc79c8": {
    name: "María",
    handle: "@maria.eth",
    rationale:
      "6 rondas a tiempo, 1 círculo completado · historial sólido",
  },
  "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc": {
    name: "Diego",
    handle: "@diegomx",
    rationale:
      "3 círculos completados, 1 demora menor · perfil moderado",
  },
  "0x90f79bf6eb2c4f870365e785982e1f101e93b906": {
    name: "Lupe",
    handle: "@guadalupe_v",
    rationale: "billetera nueva, cold-start · historial limitado",
  },
  "0x15d34aaf54267db7d7c367839aaf71a00a2c6a65": {
    name: "0xkito",
    handle: "@0xkito",
    rationale:
      "billetera nueva sin historial, default previo detectado · colateral máximo",
  },

  // ── Arbitrum Sepolia members (keccak-derived seed addresses) ───────────────
  "0xf0e7d67a871b8b181c408bedee82cffc0cb2db53": {
    name: "María",
    handle: "@maria.eth",
    rationale: "6 rondas a tiempo, 1 círculo completado · historial sólido",
  },
  "0x4b197d3c8eed5dfadf5113273277b27b61538d93": {
    name: "Diego",
    handle: "@diegomx",
    rationale: "3 círculos completados, 1 demora menor · perfil moderado",
  },
  "0xc0cc6bc960f9975e05e76823951844d1c732240f": {
    name: "Lupe",
    handle: "@guadalupe_v",
    rationale: "billetera nueva, cold-start · historial limitado",
  },
  "0x29ba4bbd669c2c6338b2d33c8e33e6b5ddc5aad9": {
    name: "0xkito",
    handle: "@0xkito",
    rationale:
      "billetera nueva sin historial, default previo detectado · colateral máximo",
  },
};

import { shortAddr } from "./format";

export function getMemberInfo(address: string) {
  const key = address.toLowerCase();
  return (
    MEMBER_MAP[key] ?? {
      name: shortAddr(address),
      handle: shortAddr(address),
      rationale: "Sin historial disponible",
    }
  );
}
