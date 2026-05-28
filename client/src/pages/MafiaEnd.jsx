import "./MafiaEnd.css";

const ROLE_COLORS = {
  mafia: "#dc2626",
  detective: "#3b82f6",
  doctor: "#22c55e",
  civilian: "#6b7280",
};

const ROLE_EMOJI = {
  mafia: "🔪",
  detective: "🔍",
  doctor: "💊",
  civilian: "🏠",
};

export default function MafiaEnd({ winner, players, onPlayAgain, onBackToHub }) {
  const sorted = [...players].sort((a, b) => {
    // Alive first, then by role importance
    if (a.isAlive !== b.isAlive) return b.isAlive - a.isAlive;
    const order = { mafia: 0, detective: 1, doctor: 2, civilian: 3 };
    return (order[a.role] ?? 4) - (order[b.role] ?? 4);
  });

  return (
    <div className="mend">
      <div className="mend-card">
        <div className={`mend-banner ${winner}`}>
          <span className="mend-banner-icon">{winner === "mafia" ? "🔪" : "🏠"}</span>
          <h2 className="mend-banner-text">
            {winner === "mafia" ? "Mafia Wins" : "Town Wins"}
          </h2>
          <p className="mend-banner-sub">
            {winner === "mafia"
              ? "The Mafia has taken over the town."
              : "The town has found and eliminated all Mafia members."
            }
          </p>
        </div>

        <div className="mend-section-label">All Roles Revealed</div>

        <div className="mend-player-list">
          {sorted.map(p => (
            <div key={p.id} className={`mend-player ${p.isAlive ? "" : "dead"}`}>
              <span className="mend-player-emoji">{ROLE_EMOJI[p.role] || "?"}</span>
              <span className="mend-player-name">{p.name}</span>
              <span className="mend-player-role" style={{ color: ROLE_COLORS[p.role] || "#777" }}>
                {p.role}
              </span>
              <span className={`mend-player-status ${p.isAlive ? "alive" : ""}`}>
                {p.isAlive ? "Survived" : "Eliminated"}
              </span>
            </div>
          ))}
        </div>

        <div className="mend-actions">
          <button className="mend-btn mend-btn-primary" onClick={onPlayAgain}>Play Again</button>
          <button className="mend-btn mend-btn-ghost" onClick={onBackToHub}>All Games</button>
        </div>
      </div>
    </div>
  );
}
