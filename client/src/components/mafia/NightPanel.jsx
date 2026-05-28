import { useState } from "react";
import "./NightPanel.css";

export default function NightPanel({ role, players, myId, onAction, actionDone, detectiveResult }) {
  const [selected, setSelected] = useState(null);
  const alive = players.filter(p => p.isAlive && p.id !== myId);

  function submit() {
    if (selected && !actionDone) onAction(selected);
  }

  // Civilians and unknown roles get the atmospheric waiting screen
  if (!role || role === "civilian") {
    return (
      <div className="night-panel night-panel--civilian">
        <div className="night-stars">
          {Array.from({ length: 12 }).map((_, i) => (
            <span key={i} className="night-star" style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
            }} />
          ))}
        </div>
        <div className="night-panel-icon">🌙</div>
        <p className="night-panel-title">The night is quiet...</p>
        <div className="night-activity-list">
          <div className="night-activity">
            <span className="night-activity-icon">🔪</span>
            <span className="night-activity-text">The Mafia chooses a victim...</span>
            <span className="night-activity-dots"><span /><span /><span /></span>
          </div>
          {players.some(p => p.isAlive && p.role === "detective") && (
            <div className="night-activity">
              <span className="night-activity-icon">🔍</span>
              <span className="night-activity-text">The Detective investigates...</span>
              <span className="night-activity-dots"><span /><span /><span /></span>
            </div>
          )}
          {players.some(p => p.isAlive && p.role === "doctor") && (
            <div className="night-activity">
              <span className="night-activity-icon">💊</span>
              <span className="night-activity-text">The Doctor protects someone...</span>
              <span className="night-activity-dots"><span /><span /><span /></span>
            </div>
          )}
        </div>
        <p className="night-panel-msg">Close your eyes and hope for the best.</p>
      </div>
    );
  }

  const labels = {
    mafia:     { title: "Choose a target to eliminate", emoji: "🔪", btn: "Kill", color: "#dc2626" },
    detective: { title: "Choose a player to investigate", emoji: "🔍", btn: "Investigate", color: "#3b82f6" },
    doctor:    { title: "Choose a player to protect", emoji: "💊", btn: "Protect", color: "#22c55e" },
  };
  const info = labels[role];

  // Doctor can save self
  const targets = role === "doctor"
    ? players.filter(p => p.isAlive)
    : alive;

  return (
    <div className="night-panel">
      <div className="night-panel-icon">{info.emoji}</div>
      <p className="night-panel-title">{info.title}</p>

      {actionDone ? (
        <div className="night-done">
          <span className="night-done-check">✓</span>
          <p className="night-done-text">Action submitted. Waiting for others...</p>
          <div className="night-done-dots"><span /><span /><span /></div>
        </div>
      ) : (
        <>
          <div className="night-targets">
            {targets.map(p => (
              <button
                key={p.id}
                className={`night-target ${selected === p.id ? "selected" : ""}`}
                onClick={() => setSelected(p.id)}
                style={selected === p.id ? { borderColor: info.color, background: `${info.color}15` } : {}}
              >
                <span className="night-target-avatar">{p.name[0].toUpperCase()}</span>
                <span className="night-target-name">{p.name}{p.id === myId ? " (you)" : ""}</span>
              </button>
            ))}
          </div>
          <button
            className="night-submit"
            onClick={submit}
            disabled={!selected}
            style={{ background: info.color }}
          >
            {info.btn}
          </button>
        </>
      )}

      {role === "detective" && detectiveResult && (
        <div className={`night-detective-result ${detectiveResult.isMafia ? "is-mafia" : "not-mafia"}`}>
          <span className="night-detective-icon">{detectiveResult.isMafia ? "🔪" : "✓"}</span>
          <strong>{detectiveResult.targetName}</strong> is {detectiveResult.isMafia ? "Mafia!" : "Not Mafia"}
        </div>
      )}
    </div>
  );
}
