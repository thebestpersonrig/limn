import { PLAYER_COLORS } from "../data/monopolyBoard";
import "./MonopolyEnd.css";

export default function MonopolyEnd({ winnerId, standings, onPlayAgain, onBackToHub }) {
  if (!standings || standings.length === 0) {
    return (
      <div className="mpolyend">
        <div className="mpolyend-card">
          <h2 className="mpolyend-title">Game Over</h2>
          <div className="mpolyend-actions">
            <button className="mpolyend-btn mpolyend-btn--primary" onClick={onPlayAgain}>Play Again</button>
            <button className="mpolyend-btn mpolyend-btn--ghost" onClick={onBackToHub}>All Games</button>
          </div>
        </div>
      </div>
    );
  }

  const winner = standings[0];

  return (
    <div className="mpolyend">
      <div className="mpolyend-card">
        <div className="mpolyend-banner">
          <span className="mpolyend-trophy">🏆</span>
          <h2 className="mpolyend-winner">{winner.name} Wins!</h2>
          <p className="mpolyend-subtitle">The last tycoon standing</p>
        </div>

        <div className="mpolyend-label">Final Standings</div>

        <div className="mpolyend-list">
          {standings.map((p, i) => (
            <div key={p.id || i} className={`mpolyend-row${i === 0 ? " mpolyend-row--winner" : ""}${p.isBankrupt ? " mpolyend-row--bankrupt" : ""}`}>
              <span className="mpolyend-rank">#{i + 1}</span>
              <span className="mpolyend-dot" style={{ background: PLAYER_COLORS[i] || "#666" }} />
              <span className="mpolyend-name">{p.name}</span>
              <span className="mpolyend-money">${p.netWorth ?? p.money ?? 0}</span>
              {p.isBankrupt && <span className="mpolyend-bankrupt">Bankrupt</span>}
            </div>
          ))}
        </div>

        <div className="mpolyend-actions">
          <button className="mpolyend-btn mpolyend-btn--primary" onClick={onPlayAgain}>Play Again</button>
          <button className="mpolyend-btn mpolyend-btn--ghost" onClick={onBackToHub}>All Games</button>
        </div>
      </div>
    </div>
  );
}
