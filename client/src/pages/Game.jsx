import { useEffect, useState } from "react";
import { getSocket } from "../hooks/useSocket";
import Canvas from "../components/Canvas";
import Toolbar from "../components/Toolbar";
import Chat from "../components/Chat";
import PlayerList from "../components/PlayerList";
import Timer from "../components/Timer";
import WordHint from "../components/WordHint";
import "./Game.css";

export default function Game({ initialRoundData, onGameEnd }) {
  const socket = getSocket();
  const [roundData, setRoundData] = useState(initialRoundData);
  const [players, setPlayers] = useState(initialRoundData?.players ?? []);
  const [myWord, setMyWord] = useState(null); // only set for drawer
  const [wordChoices, setWordChoices] = useState(null);
  const [phase, setPhase] = useState("drawing"); // choosing | drawing | roundEnd
  const [roundEndWord, setRoundEndWord] = useState(null);

  const isDrawer = roundData?.drawerId === socket.id;
  const me = players.find(p => p.id === socket.id);

  useEffect(() => {
    function onRoundStart(data) {
      setRoundData(data);
      setPlayers(data.players);
      setMyWord(null);
      setWordChoices(null);
      setPhase("choosing");
      setRoundEndWord(null);
    }

    function onChooseWord({ words }) {
      setWordChoices(words);
      setPhase("choosing");
    }

    function onWordForDrawer({ word }) {
      setMyWord(word);
      setPhase("drawing");
    }

    function onDrawingStarted() {
      setWordChoices(null);
      setPhase("drawing");
    }

    function onCorrectGuess({ players: updated }) {
      setPlayers(updated);
    }

    function onRoundEnd({ word, players: updated }) {
      setPlayers(updated);
      setRoundEndWord(word);
      setPhase("roundEnd");
    }

    function onGameEnd({ players: final }) {
      onGameEnd?.(final);
    }

    socket.on("round-start", onRoundStart);
    socket.on("choose-word", onChooseWord);
    socket.on("word-for-drawer", onWordForDrawer);
    socket.on("drawing-started", onDrawingStarted);
    socket.on("correct-guess", onCorrectGuess);
    socket.on("round-end", onRoundEnd);
    socket.on("game-end", onGameEnd);

    return () => {
      socket.off("round-start", onRoundStart);
      socket.off("choose-word", onChooseWord);
      socket.off("word-for-drawer", onWordForDrawer);
      socket.off("drawing-started", onDrawingStarted);
      socket.off("correct-guess", onCorrectGuess);
      socket.off("round-end", onRoundEnd);
      socket.off("game-end", onGameEnd);
    };
  }, []);

  function chooseWord(word) {
    socket.emit("choose-word", { word });
    setMyWord(word);
    setWordChoices(null);
  }

  return (
    <div className="game">
      {/* Header bar */}
      <div className="game-header">
        <span className="game-logo">Limn</span>
        <div className="game-hint">
          <WordHint word={myWord} isDrawer={isDrawer} />
        </div>
        <div className="game-timer">
          <Timer initial={80} />
        </div>
        <span className="game-round">
          Round {roundData?.round ?? 1}/{roundData?.totalRounds ?? 3}
        </span>
      </div>

      {/* Main layout */}
      <div className="game-body">
        <PlayerList players={players} drawerId={roundData?.drawerId} />

        <div className="game-center">
          <div className="canvas-wrap">
            <Canvas isDrawer={isDrawer && phase === "drawing"} />

            {/* Word choice overlay (drawer only) */}
            {phase === "choosing" && wordChoices && (
              <div className="word-choice-overlay">
                <p className="word-choice-label">Choose a word to draw:</p>
                <div className="word-choice-buttons">
                  {wordChoices.map(w => (
                    <button key={w} className="word-choice-btn" onClick={() => chooseWord(w)}>
                      {w}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Waiting for drawer overlay (non-drawer) */}
            {phase === "choosing" && !wordChoices && (
              <div className="word-choice-overlay">
                <p className="word-choice-label">
                  {players.find(p => p.id === roundData?.drawerId)?.name ?? "Drawer"} is choosing a word…
                </p>
              </div>
            )}

            {/* Round end overlay */}
            {phase === "roundEnd" && (
              <div className="round-end-overlay">
                <p className="round-end-label">The word was</p>
                <p className="round-end-word">{roundEndWord}</p>
                <p className="round-end-sub">Next round starting…</p>
              </div>
            )}
          </div>

          <Toolbar isDrawer={isDrawer && phase === "drawing"} />
        </div>

        <Chat isDrawer={isDrawer} hasGuessedCorrectly={me?.hasGuessedCorrectly ?? false} />
      </div>
    </div>
  );
}
