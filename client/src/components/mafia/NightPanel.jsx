import { useState } from "react";
import "./NightPanel.css";

export default function NightPanel({ role, players, myId, onAction, actionDone, detectiveResult }) {
  const [selected, setSelected] = useState(null);
  const alive = players.filter(p => p.isAlive && p.id !== myId);

  function submit() {
    if (selected && !actionDone) onAction(selected);
  }

  if (!role || role === "civilian") {
    return (
      <div className="night-panel">
        <div className="night-panel-icon">🌙</div>
        <p className="night-panel-msg">The night is quiet. Stay safe and wait…</p>
      </div>
    );
  }

  const labels = {
    mafia: { title: "Choose a target to eliminate", emoji: "🔪", btn: "Kill" },
    detective: { title: "Choose a player to investigate", emoji: "🔍", btn: "Investigate" },
    doctor: { title: "Choose a player to protect", emoji: "💊", btn: "Protect" },
  };
  const info = labels[role] || labels.civilian;

  // Doctor can save self — include self in list
  const targets = role === "doctor"
    ? players.filter(p => p.isAlive)
    : alive;

  return (
    <div className="night-panel">
      <div className="night-panel-icon">{info.emoji}</div>
      <p className="night-panel-title">{info.title}</p>

      {actionDone ? (
        <p className="night-panel-done">Action submitted. Waiting for others…</p>
      ) : (
        <>
          <div className="night-targets">
            {targets.map(p => (
              <button
                key={p.id}
                className={`night-target ${selected === p.id ? "selected" : ""}`}
                onClick={() => setSelected(p.id)}
              >
                {p.name}{p.id === myId ? " (you)" : ""}
              </button>
            ))}
          </div>
          <button
            className="night-submit"
            onClick={submit}
            disabled={!selected}
          >
            {info.btn}
          </button>
        </>
      )}

      {role === "detective" && detectiveResult && (
        <div className={`night-detective-result ${detectiveResult.isMafia ? "is-mafia" : "not-mafia"}`}>
          <strong>{detectiveResult.targetName}</strong> is {detectiveResult.isMafia ? "Mafia 🔪" : "Not Mafia ✓"}
        </div>
      )}
    </div>
  );
}
