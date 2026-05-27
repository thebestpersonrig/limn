import { useEffect, useRef, useState } from "react";
import { getSocket } from "../hooks/useSocket";
import "./GuessPanel.css";

const MAX_GUESSES = 5;

export default function GuessPanel({ isDrawer, myId }) {
  const [entries, setEntries] = useState([]); // { type: "attempt"|"correct"|"round-end", ... }
  const [input, setInput] = useState("");
  const [guessesLeft, setGuessesLeft] = useState(MAX_GUESSES);
  const [guessedCorrectly, setGuessedCorrectly] = useState(false);
  const bottomRef = useRef(null);
  const socket = getSocket();

  useEffect(() => {
    function onGuessAttempt({ playerId, name, text, guessesLeft: left }) {
      setEntries(prev => [...prev, { type: "attempt", name, text, correct: false }]);
      if (playerId === myId) setGuessesLeft(left);
    }

    function onCorrectGuess({ playerId, name, players }) {
      setEntries(prev => [...prev, { type: "correct", name }]);
      if (playerId === myId) setGuessedCorrectly(true);
      // Sync guessesLeft from server player data
      const me = players.find(p => p.id === myId);
      if (me) setGuessesLeft(me.guessesLeft);
    }

    function onRoundEnd({ word }) {
      setEntries(prev => [...prev, { type: "reveal", text: `Word was: ${word}` }]);
    }

    function onRoundStart() {
      setEntries([]);
      setGuessesLeft(MAX_GUESSES);
      setGuessedCorrectly(false);
    }

    socket.on("guess-attempt", onGuessAttempt);
    socket.on("correct-guess", onCorrectGuess);
    socket.on("round-end", onRoundEnd);
    socket.on("round-start", onRoundStart);

    return () => {
      socket.off("guess-attempt", onGuessAttempt);
      socket.off("correct-guess", onCorrectGuess);
      socket.off("round-end", onRoundEnd);
      socket.off("round-start", onRoundStart);
    };
  }, [myId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  function sendGuess() {
    const text = input.trim();
    if (!text) return;
    socket.emit("guess", { text });
    setInput("");
  }

  const outOfGuesses = guessesLeft <= 0;
  const blocked = isDrawer || guessedCorrectly || outOfGuesses;

  let placeholder = "Type your guess…";
  if (isDrawer) placeholder = "You are drawing";
  else if (guessedCorrectly) placeholder = "You got it!";
  else if (outOfGuesses) placeholder = "No guesses left";

  return (
    <div className="guess-panel">
      <div className="guess-header">
        <span>Guesses</span>
        {!isDrawer && (
          <span className={`guess-counter ${outOfGuesses ? "empty" : guessesLeft <= 2 ? "low" : ""}`}>
            {guessedCorrectly ? "✓" : `${guessesLeft}/${MAX_GUESSES} left`}
          </span>
        )}
      </div>

      <div className="guess-log">
        {entries.map((e, i) => (
          <div key={i} className={`guess-entry guess-entry--${e.type}`}>
            {e.type === "attempt" && (
              <><span className="guess-name">{e.name}: </span><span>{e.text}</span><span className="guess-x">✗</span></>
            )}
            {e.type === "correct" && (
              <><span className="guess-correct-icon">✓</span><span>{e.name} guessed it!</span></>
            )}
            {e.type === "reveal" && <span>{e.text}</span>}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="guess-input-row">
        <input
          className="guess-input"
          placeholder={placeholder}
          disabled={blocked}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && sendGuess()}
        />
        <button className="guess-send" disabled={blocked} onClick={sendGuess}>→</button>
      </div>
    </div>
  );
}
