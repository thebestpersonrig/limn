import "./PlayerList.css";

export default function PlayerList({ players, drawerId }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);

  return (
    <div className="player-list-panel">
      <h3 className="plist-title">Players</h3>
      {sorted.map(p => (
        <div key={p.id} className={`plist-row ${p.isDrawing ? "drawing" : ""} ${p.hasGuessedCorrectly ? "guessed" : ""}`}>
          <span className="plist-avatar">{p.name[0].toUpperCase()}</span>
          <span className="plist-name">{p.name}</span>
          {p.isDrawing && <span className="plist-tag draw">✏️</span>}
          {p.hasGuessedCorrectly && !p.isDrawing && <span className="plist-tag ok">✓</span>}
          <span className="plist-score">{p.score}</span>
        </div>
      ))}
    </div>
  );
}
