import { getSocket } from "../hooks/useSocket";
import "./UnoEnd.css";

export default function UnoEnd({ winnerId, winnerName, reason, onBackToHub }) {
  const socket = getSocket();
  const isWinner = socket.id === winnerId;

  return (
    <div className="uno-end">
      <div className="uno-end-card">
        <div className={`uno-end-icon${isWinner ? " uno-end-icon--win" : ""}`}>
          {isWinner ? "\u{1F3C6}" : "\u{1F0CF}"}
        </div>
        <h1 className={`uno-end-title${isWinner ? " uno-end-title--win" : " uno-end-title--lose"}`}>
          {isWinner ? "Victory!" : "Defeat"}
        </h1>
        <p className="uno-end-name">
          {isWinner ? "You emptied your hand!" : `${winnerName} wins!`}
        </p>
        {reason === "forfeit" && (
          <p className="uno-end-reason">Opponent left the game</p>
        )}
        <div className="uno-end-buttons">
          <button className="uno-end-btn" onClick={onBackToHub}>All Games</button>
        </div>
      </div>
    </div>
  );
}
