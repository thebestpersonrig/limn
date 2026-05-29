import { useEffect, useMemo } from "react";
import KartScene from "../kart/KartScene";
import { leaderboard, localPlayer, useKartStore } from "../kart/kartStore";
import { useKartControls } from "../kart/useKartControls";
import { useKartSocket } from "../kart/useKartSocket";
import { getSocket } from "../hooks/useSocket";
import "./KartBattle.css";

const weaponNames = { rocket: "Rocket", machineGun: "Machine Gun", mine: "Mine" };

export default function KartBattle({ code, playerName, playerId: initialPlayerId, snapshot: initialSnapshot, onBack }) {
  const joined = useKartSocket(true);
  useKartControls(joined);

  const snapshot = useKartStore((state) => state.snapshot);
  const playerId = useKartStore((state) => state.playerId);
  const connected = useKartStore((state) => state.connected);
  const latency = useKartStore((state) => state.latency);
  const me = localPlayer(snapshot, playerId);
  const leaders = useMemo(() => leaderboard(snapshot).slice(0, 5), [snapshot]);
  const respawnRemaining = me && !me.alive ? Math.max(0, Math.ceil((me.respawnAt - Date.now()) / 1000)) : 0;

  useEffect(() => {
    if (initialPlayerId && initialSnapshot) {
      useKartStore.getState().setJoined(initialPlayerId, initialSnapshot);
    }
  }, [initialPlayerId, initialSnapshot]);

  useEffect(() => {
    return () => {
      getSocket().emit("kart-leave");
      useKartStore.getState().resetKart();
    };
  }, []);

  return (
    <div className="kart-page">
      <KartScene menuMode={!joined} />

      {joined && (
        <div className="kart-hud">
          <div className="kart-topbar">
            <div className="kart-panel kart-status">
              <div className="kart-small-row">
                <span>{connected ? `Room ${code}` : "Reconnecting"}</span>
                <span>{latency} ms</span>
              </div>
              <Meter label="Health" value={me?.health ?? 0} color="#fb7185" />
              <Meter label="Boost" value={me?.boost ?? 0} color="#22d3ee" />
              <div className="kart-weapon">
                <span>{me?.weapon ? weaponNames[me.weapon] : "No weapon"}</span>
                <strong>{me?.ammo ?? 0}</strong>
              </div>
            </div>

            <div className="kart-panel kart-leaders">
              <h2>Leaderboard</h2>
              {leaders.map((player, index) => (
                <div className="kart-leader-row" key={player.id}>
                  <span>{index + 1}. {player.username}</span>
                  <strong>{player.score}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="kart-bottom">
            <div className="kart-panel kart-minimap">Minimap</div>
            <div className="kart-panel kart-feed">
              <h2>Kill Feed</h2>
              {(snapshot?.killFeed ?? []).slice(-5).reverse().map((event) => (
                <p key={event.id}><strong>{event.killer}</strong> eliminated {event.victim} with {weaponNames[event.weapon]}</p>
              ))}
              {(snapshot?.killFeed ?? []).length === 0 && <p className="kart-muted">No eliminations yet</p>}
            </div>
          </div>

          <div className="kart-controls">WASD drive / Shift drift / Space boost / E or click fire</div>
          <button className="kart-exit" onClick={onBack}>Back to Hub</button>

          {snapshot?.phase !== "playing" && (
            <div className="kart-center-banner">
              {snapshot?.phase === "countdown"
                ? `Match starts in ${Math.max(1, Math.ceil((snapshot.countdownEndsAt - Date.now()) / 1000))}`
                : "Waiting for another racer"}
            </div>
          )}

          {respawnRemaining > 0 && <div className="kart-respawn">Respawning in {respawnRemaining}</div>}
        </div>
      )}
    </div>
  );
}

function Meter({ label, value, color }) {
  return (
    <div className="kart-meter">
      <div className="kart-meter-label"><span>{label}</span><span>{Math.round(value)}</span></div>
      <div className="kart-meter-track">
        <div className="kart-meter-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
      </div>
    </div>
  );
}
