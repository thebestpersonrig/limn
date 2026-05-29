import { create } from "zustand";

export const useKartStore = create((set) => ({
  playerId: null,
  joined: false,
  connected: false,
  latency: 0,
  snapshot: null,
  input: {
    sequence: 0,
    throttle: 0,
    steer: 0,
    drift: false,
    boost: false,
    fire: false,
    dt: 1 / 60,
  },
  shake: 0,
  setJoined: (playerId, snapshot) => set({ playerId, snapshot, joined: true }),
  setConnected: (connected) => set({ connected }),
  setSnapshot: (snapshot) => set((state) => ({
    snapshot,
    shake: snapshot.explosions.length > (state.snapshot?.explosions.length ?? 0) ? 1 : state.shake,
  })),
  setInput: (input) => set((state) => ({ input: { ...state.input, ...input } })),
  setLatency: (latency) => set({ latency }),
  setShake: (shake) => set({ shake }),
  resetKart: () => set({ playerId: null, joined: false, snapshot: null, shake: 0 }),
}));

export function localPlayer(snapshot, playerId) {
  return snapshot?.players.find((player) => player.id === playerId) ?? null;
}

export function leaderboard(snapshot) {
  return [...(snapshot?.players ?? [])].sort((a, b) => b.score - a.score || b.kills - a.kills);
}
