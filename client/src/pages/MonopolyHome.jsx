import { useState } from "react";
import { getSocket } from "../hooks/useSocket";
import "./MonopolyHome.css";

const MONEY_OPTIONS = [1000, 1500, 2000];
const MODE_OPTIONS = [
  { value: "classic", label: "Classic", desc: "Full rules" },
  { value: "speed", label: "Speed", desc: "30-round limit" },
  { value: "simplified", label: "Simple", desc: "No auctions/trading/building" },
];
const TIMER_OPTIONS = [0, 60, 90, 120];

export default function MonopolyHome({ playerName, onJoined, onBack }) {
  const [code,    setCode]    = useState("");
  const [mode,    setMode]    = useState(null); // null | "create" | "join"
  const [error,   setError]   = useState("");
  const [pending, setPending] = useState(false);

  // Settings
  const [startingMoney, setStartingMoney] = useState(1500);
  const [gameMode,      setGameMode]      = useState("classic");
  const [turnTimer,     setTurnTimer]     = useState(90);
  const [freeParking,   setFreeParking]   = useState(false);

  function connect(cb) {
    const socket = getSocket();
    if (!socket.connected) {
      socket.connect();
      socket.once("connect", () => { socket.off("connect_error", onErr); cb(); });
      function onErr(err) {
        socket.off("connect", cb);
        setPending(false);
        setError("Can't reach the server — try again in a moment.");
      }
      socket.once("connect_error", onErr);
    } else {
      cb();
    }
  }

  function handleCreate() {
    setError("");
    setPending(true);
    connect(() => {
      const socket = getSocket();
      socket.emit("monopoly-create-room", {
        name: playerName,
        settings: { startingMoney, mode: gameMode, turnTimer, freeParking },
      });
      socket.once("monopoly-joined-room", ({ code, roomState }) => {
        setPending(false);
        onJoined({ code, roomState });
      });
      socket.once("monopoly-error", ({ message }) => { setPending(false); setError(message); });
    });
  }

  function handleJoin() {
    if (!code.trim()) return setError("Enter a room code.");
    setError("");
    setPending(true);
    connect(() => {
      const socket = getSocket();
      socket.emit("monopoly-join-room", { name: playerName, code: code.trim() });
      socket.once("monopoly-joined-room", ({ code, roomState }) => {
        setPending(false);
        onJoined({ code, roomState });
      });
      socket.once("monopoly-error", ({ message }) => { setPending(false); setError(message); });
    });
  }

  return (
    <div className="mono-home">
      <div className="mono-home-card">
        {onBack && <button className="mono-back" onClick={onBack}>← Romp</button>}
        <h1 className="mono-title">Monopoly</h1>
        <p className="mono-subtitle">Buy. Build. Bankrupt.</p>
        <div className="mono-playing-as">Playing as <strong>{playerName}</strong></div>

        {mode === null && (
          <div className="mono-buttons">
            <button className="mono-btn mono-btn-primary" onClick={() => setMode("create")}>Create Room</button>
            <button className="mono-btn mono-btn-secondary" onClick={() => setMode("join")}>Join Room</button>
          </div>
        )}

        {mode === "create" && (
          <>
            <div className="mono-config">
              <h3 className="mono-config-title">Game Settings</h3>

              <div className="mono-config-row">
                <span className="mono-config-label">Starting Money</span>
                <div className="mono-config-options">
                  {MONEY_OPTIONS.map(m => (
                    <button key={m}
                      className={`mono-config-opt ${startingMoney === m ? "active" : ""}`}
                      onClick={() => setStartingMoney(m)}
                    >${m}</button>
                  ))}
                </div>
              </div>

              <div className="mono-config-row">
                <span className="mono-config-label">Mode</span>
                <div className="mono-config-options">
                  {MODE_OPTIONS.map(m => (
                    <button key={m.value}
                      className={`mono-config-opt ${gameMode === m.value ? "active" : ""}`}
                      onClick={() => setGameMode(m.value)}
                      title={m.desc}
                    >{m.label}</button>
                  ))}
                </div>
              </div>

              <div className="mono-config-row">
                <span className="mono-config-label">Turn Timer</span>
                <div className="mono-config-options">
                  {TIMER_OPTIONS.map(t => (
                    <button key={t}
                      className={`mono-config-opt ${turnTimer === t ? "active" : ""}`}
                      onClick={() => setTurnTimer(t)}
                    >{t === 0 ? "Off" : `${t}s`}</button>
                  ))}
                </div>
              </div>

              <div className="mono-config-row">
                <span className="mono-config-label">Free Parking</span>
                <button
                  className={`mono-config-toggle ${freeParking ? "on" : ""}`}
                  onClick={() => setFreeParking(!freeParking)}
                >{freeParking ? "Collect Taxes" : "Nothing"}</button>
              </div>
            </div>

            {error && <p className="mono-error">{error}</p>}

            <div className="mono-buttons">
              <button className="mono-btn mono-btn-primary" onClick={handleCreate} disabled={pending}>
                {pending ? "Creating…" : "Create Room →"}
              </button>
              <button className="mono-btn mono-btn-ghost" onClick={() => { setMode(null); setError(""); }} disabled={pending}>Back</button>
            </div>
          </>
        )}

        {mode === "join" && (
          <>
            <input
              className="mono-input"
              placeholder="Room code"
              value={code}
              maxLength={6}
              onChange={e => setCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && handleJoin()}
              autoFocus
            />
            {error && <p className="mono-error">{error}</p>}
            <div className="mono-buttons">
              <button className="mono-btn mono-btn-primary" onClick={handleJoin} disabled={pending}>
                {pending ? "Joining…" : "Join"}
              </button>
              <button className="mono-btn mono-btn-ghost" onClick={() => { setMode(null); setCode(""); setError(""); }} disabled={pending}>Back</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
