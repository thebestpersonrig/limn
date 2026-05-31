import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getSocket, clearSession } from "../hooks/useSocket";
import "./HangmanGame.css";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export default function HangmanGame() {
  const navigate = useNavigate();
  const { code } = useParams();
  const socket = getSocket();
  const myId = socket.id;

  const [phase, setPhase] = useState("lobby");
  const [players, setPlayers] = useState([]);
  const [scores, setScores] = useState([]);
  const [round, setRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(0);
  const [pickerName, setPickerName] = useState("");
  const [pickerId, setPickerId] = useState(null);
  const [copied, setCopied] = useState(false);

  // Picking state
  const [wordInput, setWordInput] = useState("");
  const [hintInput, setHintInput] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);

  // Guessing state
  const [blanks, setBlanks] = useState("");
  const [hint, setHint] = useState("");
  const [wrongLetters, setWrongLetters] = useState([]);
  const [stage, setStage] = useState(0);
  const [lastResult, setLastResult] = useState(null);

  // Round end
  const [roundResult, setRoundResult] = useState(null);

  // Game end
  const [finalScores, setFinalScores] = useState(null);

  useEffect(() => {
    function onRoomState(state) {
      setPlayers(state.players || []);
      setPhase(state.phase);
      setScores(state.scores || []);
      setRound(state.round);
      setTotalRounds(state.totalRounds);
    }

    function onPhaseChange(data) {
      setPhase(data.phase);
      setRound(data.round);
      setTotalRounds(data.totalRounds);
      setPickerName(data.pickerName || "");
      setPickerId(data.pickerId || null);

      if (data.phase === "picking") {
        setWordInput("");
        setHintInput("");
        setLastResult(null);
        setRoundResult(null);
      }
      if (data.phase === "guessing") {
        setBlanks(data.blanks || "");
        setHint(data.hint || "");
        setWrongLetters(data.wrongLetters || []);
        setStage(data.stage || 0);
        setLastResult(null);
      }
    }

    function onLetterResult(data) {
      setBlanks(data.blanks);
      setWrongLetters(data.wrongLetters);
      setStage(data.stage);
      setLastResult(data);
    }

    function onRoundEnd(data) {
      setPhase("roundEnd");
      setRoundResult(data);
      setScores(data.scores || []);
    }

    function onGameEnd(data) {
      setPhase("ended");
      setFinalScores(data);
    }

    function onTimerTick({ timeLeft: tl }) {
      setTimeLeft(tl);
    }

    function onError({ message }) {
      if (message === "Room not found.") {
        clearSession();
        navigate("/hangman");
      }
    }

    socket.on("hang-room-state", onRoomState);
    socket.on("hang-phase", onPhaseChange);
    socket.on("hang-letter-result", onLetterResult);
    socket.on("hang-round-end", onRoundEnd);
    socket.on("hang-game-end", onGameEnd);
    socket.on("hang-timer-tick", onTimerTick);
    socket.on("hang-error", onError);

    socket.emit("hang-get-state");

    return () => {
      socket.off("hang-room-state", onRoomState);
      socket.off("hang-phase", onPhaseChange);
      socket.off("hang-letter-result", onLetterResult);
      socket.off("hang-round-end", onRoundEnd);
      socket.off("hang-game-end", onGameEnd);
      socket.off("hang-timer-tick", onTimerTick);
      socket.off("hang-error", onError);
    };
  }, []);

  function handleLeave() {
    socket.emit("hang-leave");
    clearSession();
    navigate("/hangman");
  }

  function handleStart() {
    socket.emit("hang-start-game");
  }

  function handleSubmitWord() {
    if (wordInput.trim().length < 2) return;
    socket.emit("hang-submit-word", { word: wordInput.trim(), hint: hintInput.trim() });
  }

  function handleGuess(letter) {
    socket.emit("hang-guess-letter", { letter });
  }

  function copyCode() {
    const url = `${window.location.origin}/hangman/${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const isHost = players.length > 0 && players[0]?.id === myId;
  const isPicker = pickerId === myId;
  const guessedLetters = new Set([
    ...blanks.split("").filter(c => /[A-Z]/.test(c)),
    ...wrongLetters,
  ]);

  // Lobby
  if (phase === "lobby") {
    return (
      <div className="hang-page">
        <div className="hang-lobby">
          <button className="hang-leave" onClick={handleLeave}>Back</button>
          <h2 className="hang-lobby-title">Hangman</h2>
          <div className="hang-code-row">
            <span className="hang-code-label">Room code</span>
            <div className="hang-code-box">
              <span className="hang-code-badge">{code}</span>
              <button className="hang-copy-btn" onClick={copyCode}>
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>
          </div>
          <div className="hang-player-list">
            {players.map((p, i) => (
              <div key={p.id} className="hang-player-row">
                <span className="hang-player-avatar">{p.name[0].toUpperCase()}</span>
                <span className="hang-player-name">{p.name}</span>
                {i === 0 && <span className="hang-host-badge">host</span>}
              </div>
            ))}
          </div>
          {isHost ? (
            <button
              className="hang-start-btn"
              onClick={handleStart}
              disabled={players.length < 2}
            >
              {players.length < 2 ? "Need 1 more player..." : "Start Game"}
            </button>
          ) : (
            <p className="hang-waiting-text">Waiting for the host to start...</p>
          )}
        </div>
      </div>
    );
  }

  // Game end
  if (phase === "ended" && finalScores) {
    const winner = finalScores.winner;
    return (
      <div className="hang-page">
        <div className="hang-end">
          <h2 className="hang-end-title">Game Over!</h2>
          {winner && (
            <div className="hang-end-winner">
              <span className="hang-end-trophy">🏆</span>
              <strong>{winner.name}</strong> wins with {winner.points} points!
            </div>
          )}
          <div className="hang-end-scores">
            {(finalScores.finalScores || []).map((s, i) => (
              <div key={s.id} className={`hang-end-score-row ${i === 0 ? "hang-end-first" : ""}`}>
                <span className="hang-end-rank">#{i + 1}</span>
                <span className="hang-end-name">{s.name}</span>
                <span className="hang-end-points">{s.points} pts</span>
              </div>
            ))}
          </div>
          <button className="hang-end-back" onClick={handleLeave}>Back to Lobby</button>
        </div>
      </div>
    );
  }

  // Round end
  if (phase === "roundEnd" && roundResult) {
    return (
      <div className="hang-page">
        <div className="hang-round-result">
          <h2 className="hang-round-title">
            {roundResult.won ? "Word Guessed!" : "Hanged!"}
          </h2>
          <p className="hang-round-word">The word was: <strong>{roundResult.word}</strong></p>
          <div className="hang-round-scores">
            {(roundResult.scores || []).map((s, i) => (
              <div key={s.id} className="hang-round-score-row">
                <span className="hang-round-name">{s.name}</span>
                <span className="hang-round-pts">{s.points} pts</span>
              </div>
            ))}
          </div>
          <p className="hang-round-next">Next round starting...</p>
        </div>
      </div>
    );
  }

  // Picking phase (I'm the picker)
  if (phase === "picking" && isPicker) {
    return (
      <div className="hang-page">
        <div className="hang-pick">
          <div className="hang-game-header">
            <button className="hang-leave" onClick={handleLeave}>Leave</button>
            <span className="hang-round-info">Round {round}/{totalRounds}</span>
          </div>
          <h2 className="hang-pick-title">Your turn to pick a word!</h2>
          {timeLeft > 0 && <span className="hang-pick-timer">{timeLeft}s</span>}
          <input
            className="hang-pick-input"
            placeholder="Enter a word or phrase"
            value={wordInput}
            maxLength={30}
            onChange={(e) => setWordInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmitWord()}
            autoFocus
          />
          <input
            className="hang-pick-hint"
            placeholder="Hint (optional)"
            value={hintInput}
            maxLength={60}
            onChange={(e) => setHintInput(e.target.value)}
          />
          <button
            className="hang-pick-submit"
            onClick={handleSubmitWord}
            disabled={wordInput.trim().length < 2}
          >
            Submit Word
          </button>
        </div>
      </div>
    );
  }

  // Picking phase (I'm NOT the picker)
  if (phase === "picking" && !isPicker) {
    return (
      <div className="hang-page">
        <div className="hang-waiting-pick">
          <div className="hang-game-header">
            <button className="hang-leave" onClick={handleLeave}>Leave</button>
            <span className="hang-round-info">Round {round}/{totalRounds}</span>
          </div>
          <span className="hang-waiting-icon">🤔</span>
          <p className="hang-waiting-msg"><strong>{pickerName}</strong> is picking a word...</p>
        </div>
      </div>
    );
  }

  // Guessing phase
  return (
    <div className="hang-page">
      <div className="hang-guess">
        <div className="hang-game-header">
          <button className="hang-leave" onClick={handleLeave}>Leave</button>
          <span className="hang-round-info">Round {round}/{totalRounds}</span>
          <span className="hang-picker-info">{pickerName}'s word</span>
        </div>

        {/* Hangman drawing */}
        <div className="hang-drawing">
          <HangmanSVG stage={stage} />
        </div>

        {/* Word display */}
        <div className="hang-word-display">
          {blanks.split("").map((ch, i) => (
            <span key={i} className={`hang-letter ${ch === "_" ? "hang-letter--blank" : ""} ${ch === " " ? "hang-letter--space" : ""}`}>
              {ch === "_" ? " " : ch}
            </span>
          ))}
        </div>

        {hint && <p className="hang-hint">Hint: {hint}</p>}

        {/* Wrong letters */}
        {wrongLetters.length > 0 && (
          <div className="hang-wrong">
            Wrong: {wrongLetters.join(", ")} ({wrongLetters.length}/{6})
          </div>
        )}

        {/* Last result toast */}
        {lastResult && (
          <div className={`hang-toast ${lastResult.correct ? "hang-toast--correct" : "hang-toast--wrong"}`}>
            {lastResult.guesserName}: "{lastResult.letter}" - {lastResult.correct ? `Correct! +${lastResult.points}` : "Wrong!"}
          </div>
        )}

        {/* Keyboard */}
        {!isPicker && (
          <div className="hang-keyboard">
            {ALPHABET.map(letter => {
              const used = guessedLetters.has(letter);
              const isCorrect = used && blanks.includes(letter);
              const isWrong = wrongLetters.includes(letter);
              return (
                <button
                  key={letter}
                  className={`hang-key ${isCorrect ? "hang-key--correct" : ""} ${isWrong ? "hang-key--wrong" : ""} ${used ? "hang-key--used" : ""}`}
                  onClick={() => handleGuess(letter)}
                  disabled={used}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        )}

        {isPicker && (
          <p className="hang-picker-msg">You picked this word. Watch them guess!</p>
        )}

        {/* Scoreboard */}
        <div className="hang-scores-sidebar">
          {scores.map((s) => (
            <div key={s.id} className="hang-score-row">
              <span className="hang-score-name">{s.name}</span>
              <span className="hang-score-pts">{s.points}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HangmanSVG({ stage }) {
  return (
    <svg viewBox="0 0 200 200" className="hang-svg">
      {/* Gallows */}
      <line x1="20" y1="180" x2="180" y2="180" stroke="#444" strokeWidth="3" />
      <line x1="60" y1="180" x2="60" y2="20" stroke="#444" strokeWidth="3" />
      <line x1="60" y1="20" x2="130" y2="20" stroke="#444" strokeWidth="3" />
      <line x1="130" y1="20" x2="130" y2="40" stroke="#444" strokeWidth="3" />

      {/* Head */}
      {stage >= 1 && (
        <circle cx="130" cy="55" r="15" stroke="#f43f5e" strokeWidth="3" fill="none" />
      )}
      {/* Body */}
      {stage >= 2 && (
        <line x1="130" y1="70" x2="130" y2="120" stroke="#f43f5e" strokeWidth="3" />
      )}
      {/* Left arm */}
      {stage >= 3 && (
        <line x1="130" y1="85" x2="105" y2="105" stroke="#f43f5e" strokeWidth="3" />
      )}
      {/* Right arm */}
      {stage >= 4 && (
        <line x1="130" y1="85" x2="155" y2="105" stroke="#f43f5e" strokeWidth="3" />
      )}
      {/* Left leg */}
      {stage >= 5 && (
        <line x1="130" y1="120" x2="110" y2="155" stroke="#f43f5e" strokeWidth="3" />
      )}
      {/* Right leg */}
      {stage >= 6 && (
        <line x1="130" y1="120" x2="150" y2="155" stroke="#f43f5e" strokeWidth="3" />
      )}
    </svg>
  );
}
