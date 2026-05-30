import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSocket, clearSession } from "../hooks/useSocket";
import "./UnoLobby.css";

const RULE_INFO = {
  stacking: { label: "Stacking", desc: "Stack +2 and +4 cards. Play equal or higher draw cards to pass the penalty." },
  jumpIn:   { label: "Jump In", desc: "Play an exact duplicate of the discard card out of turn." },
  sevenZero:{ label: "Seven-0", desc: "Playing 7 swaps your hand with an opponent. Playing 0 rotates all hands." },
  noBluffWild4: { label: "No Bluff +4", desc: "Wild +4 can be played anytime, even if you have matching cards." },
};

export default function UnoLobby({ code, roomState, onBack }) {
  const socket = getSocket();
  const navigate = useNavigate();
  const [state, setState] = useState(roomState);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const isHost = state?.players?.[0]?.id === socket.id;
  const players = state?.players || [];
  const houseRules = state?.houseRules || { stacking: true, jumpIn: false, sevenZero: false, noBluffWild4: false };

  useEffect(() => {
    function onRoomState(s) { setState(s); }
    function onErr({ message }) { setError(message); }

    socket.on("uno-room-state", onRoomState);
    socket.on("uno-error", onErr);
    return () => {
      socket.off("uno-room-state", onRoomState);
      socket.off("uno-error", onErr);
    };
  }, [socket]);

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleStart() {
    socket.emit("uno-start-game");
  }

  function toggleRule(key) {
    if (!isHost) return;
    const updated = { ...houseRules, [key]: !houseRules[key] };
    socket.emit("uno-update-rules", { rules: updated });
  }

  return (
    <div className="uno-lobby">
      <div className="uno-lobby-card">
        <button className="uno-lobby-back" onClick={onBack}>Back to Romp</button>
        <h1 className="uno-lobby-title">Uno</h1>

        {/* Room code */}
        <div className="uno-lobby-code-row">
          <span className="uno-lobby-code-label">Room Code</span>
          <div className="uno-lobby-code-box">
            <span className="uno-lobby-code-badge">{code}</span>
            <button className="uno-lobby-copy-btn" onClick={handleCopy}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        {/* Player list */}
        <div className="uno-lobby-player-list">
          {Array.from({ length: 6 }, (_, i) => {
            const p = players[i];
            return (
              <div key={i} className={`uno-lobby-player-row${p ? "" : " uno-lobby-player-row--empty"}`}>
                <span className="uno-lobby-player-icon">{p ? "\u{1F0CF}" : "\u{1F4AD}"}</span>
                <span className={`uno-lobby-player-name${p ? "" : " uno-lobby-muted"}`}>
                  {p ? p.name : "Waiting..."}
                </span>
                {p && i === 0 && <span className="uno-lobby-host-badge">Host</span>}
              </div>
            );
          })}
        </div>

        {/* House Rules */}
        <div className="uno-lobby-rules">
          <h3 className="uno-lobby-rules-title">House Rules</h3>
          {Object.entries(RULE_INFO).map(([key, info]) => (
            <div key={key} className="uno-lobby-rule-row">
              <div className="uno-lobby-rule-info">
                <span className="uno-lobby-rule-label">{info.label}</span>
                <span className="uno-lobby-rule-desc">{info.desc}</span>
              </div>
              <button
                className={`uno-lobby-rule-toggle${houseRules[key] ? " uno-lobby-rule-toggle--on" : ""}`}
                onClick={() => toggleRule(key)}
                disabled={!isHost}
                title={isHost ? "Toggle" : "Only the host can change rules"}
              >
                <span className="uno-lobby-rule-toggle-knob" />
              </button>
            </div>
          ))}
        </div>

        {error && <p className="uno-lobby-error">{error}</p>}

        {isHost ? (
          <button
            className="uno-lobby-start-btn"
            onClick={handleStart}
            disabled={players.length < 2}
          >
            {players.length < 2 ? "Need 2+ players" : "Start Game"}
          </button>
        ) : (
          <p className="uno-lobby-waiting">Waiting for host to start...</p>
        )}
      </div>
    </div>
  );
}
