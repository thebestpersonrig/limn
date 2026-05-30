import { useEffect, useMemo, useRef, useState } from "react";
import KartScene from "../kart/KartScene";
import { leaderboard, localPlayer, useKartStore } from "../kart/kartStore";
import { useKartControls } from "../kart/useKartControls";
import { useKartSocket } from "../kart/useKartSocket";
import { getSocket } from "../hooks/useSocket";
import "./KartBattle.css";

const weaponNames = { rocket: "Rocket", machineGun: "Machine Gun", mine: "Mine", ram: "Ram" };
const weaponEmoji = { rocket: "\u{1F680}", machineGun: "\u{1F52B}", mine: "\u{1F4A3}", ram: "\u{1F697}" };
const ARENA_RADIUS = 42;

function Minimap({ snapshot, playerId }) {
  const canvasRef = useRef(null);
  const size = 140;
  const scale = size / (ARENA_RADIUS * 2.2);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !snapshot) return;

    ctx.clearRect(0, 0, size, size);
    const cx = size / 2, cy = size / 2;

    // Arena circle
    ctx.beginPath();
    ctx.arc(cx, cy, ARENA_RADIUS * scale, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Pickups
    (snapshot.pickups || []).forEach(p => {
      if (p.availableAt > Date.now()) return;
      const px = cx + p.position.x * scale;
      const py = cy + p.position.z * scale;
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = p.type === "boost" ? "#22d3ee" : "#fef08a";
      ctx.fill();
    });

    // Projectiles
    (snapshot.projectiles || []).forEach(p => {
      const px = cx + p.position.x * scale;
      const py = cy + p.position.z * scale;
      ctx.beginPath();
      ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = p.type === "mine" ? "#a78bfa" : "#fb7185";
      ctx.fill();
    });

    // Other players
    (snapshot.players || []).forEach(p => {
      if (!p.alive) return;
      const px = cx + p.position.x * scale;
      const py = cy + p.position.z * scale;
      const isMe = p.id === playerId;
      ctx.beginPath();
      ctx.arc(px, py, isMe ? 4.5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = isMe ? "#fef08a" : p.color;
      ctx.fill();
      if (isMe) {
        // Direction indicator
        const dx = Math.sin(p.rotationY) * 7;
        const dz = Math.cos(p.rotationY) * 7;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + dx * scale, py + dz * scale);
        ctx.strokeStyle = "#fef08a";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
  }, [snapshot, playerId, scale]);

  return <canvas ref={canvasRef} width={size} height={size} className="kart-minimap-canvas" />;
}

function DamageFlash({ snapshot, playerId }) {
  const [flash, setFlash] = useState(0);
  const prevHealth = useRef(100);

  useEffect(() => {
    const me = snapshot?.players?.find(p => p.id === playerId);
    if (!me) return;
    if (me.health < prevHealth.current && me.alive) {
      setFlash(1);
      const t = setTimeout(() => setFlash(0), 300);
      prevHealth.current = me.health;
      return () => clearTimeout(t);
    }
    prevHealth.current = me.health;
  }, [snapshot, playerId]);

  if (!flash) return null;
  return <div className="kart-damage-flash" />;
}

function KillPopup({ snapshot, playerId }) {
  const [popup, setPopup] = useState(null);
  const prevKills = useRef(0);

  useEffect(() => {
    const me = snapshot?.players?.find(p => p.id === playerId);
    if (!me) return;
    if (me.kills > prevKills.current) {
      const feed = snapshot.killFeed || [];
      const lastKill = feed.filter(e => e.killer === me.username).pop();
      setPopup({
        victim: lastKill?.victim || "Enemy",
        weapon: lastKill?.weapon || "rocket",
      });
      const t = setTimeout(() => setPopup(null), 2500);
      prevKills.current = me.kills;
      return () => clearTimeout(t);
    }
    prevKills.current = me.kills;
  }, [snapshot, playerId]);

  if (!popup) return null;
  return (
    <div className="kart-kill-popup">
      <span className="kart-kill-popup-score">+100</span>
      <span className="kart-kill-popup-text">
        Eliminated <strong>{popup.victim}</strong> {weaponEmoji[popup.weapon] || ""}
      </span>
    </div>
  );
}

function DeathInfo({ snapshot, playerId }) {
  const me = snapshot?.players?.find(p => p.id === playerId);
  if (!me || me.alive) return null;
  const remaining = Math.max(0, Math.ceil((me.respawnAt - Date.now()) / 1000));

  const feed = snapshot.killFeed || [];
  const myDeath = feed.filter(e => e.victim === me.username).pop();

  return (
    <div className="kart-death-screen">
      <div className="kart-death-title">ELIMINATED</div>
      {myDeath && (
        <div className="kart-death-by">
          by <strong>{myDeath.killer}</strong> {weaponEmoji[myDeath.weapon] || ""} {weaponNames[myDeath.weapon] || ""}
        </div>
      )}
      <div className="kart-death-timer">Respawning in {remaining}...</div>
    </div>
  );
}

function MobileControls({ enabled }) {
  const setInput = useKartStore(s => s.setInput);
  const seqRef = useRef(1000);
  const activeRef = useRef({ throttle: 0, steer: 0, fire: false, boost: false, drift: false });

  function emit(patch) {
    Object.assign(activeRef.current, patch);
    seqRef.current++;
    setInput({ ...activeRef.current, sequence: seqRef.current });
  }

  if (!enabled) return null;

  return (
    <div className="kart-mobile-controls">
      <div className="kart-mobile-left">
        <button className="kart-mobile-btn kart-mobile-btn-lg"
          onTouchStart={() => emit({ throttle: 1 })} onTouchEnd={() => emit({ throttle: 0 })}>
          GAS
        </button>
        <div className="kart-mobile-steer-row">
          <button className="kart-mobile-btn"
            onTouchStart={() => emit({ steer: -1 })} onTouchEnd={() => emit({ steer: 0 })}>
            &#9664;
          </button>
          <button className="kart-mobile-btn"
            onTouchStart={() => emit({ steer: 1 })} onTouchEnd={() => emit({ steer: 0 })}>
            &#9654;
          </button>
        </div>
        <button className="kart-mobile-btn kart-mobile-btn-sm"
          onTouchStart={() => emit({ throttle: -1 })} onTouchEnd={() => emit({ throttle: 0 })}>
          REV
        </button>
      </div>
      <div className="kart-mobile-right">
        <button className="kart-mobile-btn kart-mobile-btn-fire"
          onTouchStart={() => emit({ fire: true })} onTouchEnd={() => emit({ fire: false })}>
          FIRE
        </button>
        <button className="kart-mobile-btn kart-mobile-btn-boost"
          onTouchStart={() => emit({ boost: true })} onTouchEnd={() => emit({ boost: false })}>
          BOOST
        </button>
        <button className="kart-mobile-btn kart-mobile-btn-drift"
          onTouchStart={() => emit({ drift: true })} onTouchEnd={() => emit({ drift: false })}>
          DRIFT
        </button>
      </div>
    </div>
  );
}

export default function KartBattle({ code, playerName, onBack }) {
  const joined = useKartSocket(true);
  const isMobile = useMemo(() => 'ontouchstart' in window || navigator.maxTouchPoints > 0, []);
  useKartControls(joined && !isMobile);

  const snapshot = useKartStore(s => s.snapshot);
  const playerId = useKartStore(s => s.playerId);
  const connected = useKartStore(s => s.connected);
  const latency = useKartStore(s => s.latency);
  const me = localPlayer(snapshot, playerId);
  const leaders = useMemo(() => leaderboard(snapshot).slice(0, 5), [snapshot]);
  const playerCount = snapshot?.players?.length || 0;

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
          <DamageFlash snapshot={snapshot} playerId={playerId} />
          <KillPopup snapshot={snapshot} playerId={playerId} />

          <div className="kart-topbar">
            <div className="kart-panel kart-status">
              <div className="kart-small-row">
                <span>{connected ? `Room ${code}` : "Reconnecting..."}</span>
                <span>{latency}ms | {playerCount} players</span>
              </div>
              <Meter label="Health" value={me?.health ?? 0} color="#fb7185" />
              <Meter label="Boost" value={me?.boost ?? 0} color="#22d3ee" />
              <div className="kart-weapon">
                <span>{me?.weapon ? `${weaponEmoji[me.weapon] || ""} ${weaponNames[me.weapon]}` : "No weapon"}</span>
                <strong>{me?.ammo ?? 0}</strong>
              </div>
            </div>

            <div className="kart-panel kart-leaders">
              <h2>Leaderboard</h2>
              {leaders.map((player, index) => (
                <div className={`kart-leader-row${player.id === playerId ? " kart-leader-row--me" : ""}`} key={player.id}>
                  <span>
                    <span className="kart-leader-rank">{index + 1}</span>
                    <span className="kart-leader-color" style={{ background: player.color }} />
                    {player.username}
                  </span>
                  <strong>{player.score} <span className="kart-leader-kd">{player.kills}K/{player.deaths}D</span></strong>
                </div>
              ))}
            </div>
          </div>

          <div className="kart-bottom">
            <div className="kart-panel kart-minimap-panel">
              <Minimap snapshot={snapshot} playerId={playerId} />
            </div>
            <div className="kart-panel kart-feed">
              <h2>Kill Feed</h2>
              {(snapshot?.killFeed ?? []).slice(-5).reverse().map(event => (
                <p key={event.id}>
                  {weaponEmoji[event.weapon] || ""} <strong>{event.killer}</strong> eliminated {event.victim}
                </p>
              ))}
              {(snapshot?.killFeed ?? []).length === 0 && <p className="kart-muted">No eliminations yet</p>}
            </div>
          </div>

          {!isMobile && (
            <div className="kart-controls">
              <span>WASD</span> drive | <span>Shift</span> drift | <span>Space</span> boost | <span>E / Click</span> fire
            </div>
          )}

          <button className="kart-exit" onClick={onBack}>Exit</button>

          <DeathInfo snapshot={snapshot} playerId={playerId} />

          {snapshot?.phase !== "playing" && me?.alive !== false && (
            <div className="kart-center-banner">
              {snapshot?.phase === "countdown"
                ? `${Math.max(1, Math.ceil((snapshot.countdownEndsAt - Date.now()) / 1000))}`
                : `Waiting for players (${playerCount}/2)`}
            </div>
          )}

          <MobileControls enabled={joined && isMobile} />
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
