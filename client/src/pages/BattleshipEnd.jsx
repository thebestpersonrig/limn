import { getSocket } from "../hooks/useSocket";
import "./BattleshipEnd.css";

export default function BattleshipEnd({ winnerId, winnerName, reason, onBackToHub }) {
  const socket = getSocket();
  const isWinner = winnerId === socket.id;

  return (
    <div className="bship-end">
      <div className="bship-end-card">
        <span className="bship-end-trophy">{isWinner ? "\u{1F3C6}" : "\u{1F6A2}"}</span>
        <h2 className={`bship-end-title${isWinner ? "" : " bship-end-title--lost"}`}>
          {reason === "forfeit"
            ? "Opponent Left"
            : isWinner
              ? "Victory!"
              : "Defeat"}
        </h2>
        <p className="bship-end-winner">
          <strong>{winnerName}</strong> wins!
        </p>
        <p className="bship-end-subtitle">
          {reason === "forfeit"
            ? "Your opponent abandoned ship."
            : isWinner
              ? "All enemy ships have been sunk."
              : "Your fleet has been destroyed."}
        </p>
        <div className="bship-end-actions">
          <button className="bship-end-btn bship-end-btn--primary" onClick={onBackToHub}>
            All Games
          </button>
        </div>
      </div>
    </div>
  );
}
