import "./MafiaEnd.css";

const ROLE_COLORS = {
  mafia: "#dc2626",
  detective: "#3b82f6",
  doctor: "#22c55e",
  civilian: "#6b7280",
};

export default function MafiaEnd({ winner, players, onPlayAgain, onBackToHub }) {
  return (
    <div className="mend">
      <div className="mend-card">
        <div className={`mend-banner ${winner}`}>
          <span className="mend-banner-icon">{winner === "mafia" ? "🔪" : "🏠"}</span>
          <h2 className="mend-banner-text">
            {winner === "mafia" ? "Mafia Wins" : "Town Wins"}
          </h2>
        </div>

        <div className="mend-player-list">
          {players.map(p => (
            <div key={p.id} className={`mend-player ${p.isAlive ? "" : "dead"}`}>
              <span className="mend-player-name">{p.name}</span>
              <span className="mend-player-role" style={{ color: ROLE_COLORS[p.role] || "#777" }}>
                {p.role}
              </span>
              <span className="mend-player-status">
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
