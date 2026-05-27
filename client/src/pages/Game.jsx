import { useEffect, useState } from "react";
import { getSocket } from "../hooks/useSocket";
import Canvas from "../components/Canvas";
import Toolbar from "../components/Toolbar";
import GuessPanel from "../components/GuessPanel";
import PlayerList from "../components/PlayerList";
import Timer from "../components/Timer";
import WordHint from "../components/WordHint";
import "./Game.css";

export default function Game({ initialRoundData, onGameEnd }) {
  const socket = getSocket();
  const [roundData, setRoundData] = useState(initialRoundData);
  const [players, setPlayers] = useState(initialRoundData?.players ?? []);
  const [myWord, setMyWord] = useState(null);
  const [wordChoices, setWordChoices] = useState(initialRoundData?.wordChoices ?? null);
  const [phase, setPhase] = useState("choosing");
  const [roundEndWord, setRoundEndWord] = useState(null);
  const [mobileTab, setMobileTab] = useState("guess");

  const isDrawer = roundData?.drawerId === socket.id;
  const drawerName = players.find(p => p.id === roundData?.drawerId)?.name ?? "Drawer";

  useEffect(() => {
    function onRoundStart(data) {
      setRoundData(data);
      setPlayers(data.players);
      setMyWord(null);
      setWordChoices(data.wordChoices ?? null);
      setPhase("choosing");
      setRoundEndWord(null);
    }
    function onWordForDrawer({ word }) { setMyWord(word); setPhase("drawing"); }
    function onDrawingStarted() { setWordChoices(null); setPhase("drawing"); }
    function onCorrectGuess({ players: updated }) { setPlayers(updated); }
    function onRoundEnd({ word, players: updated }) {
      setPlayers(updated);
      setRoundEndWord(word);
      setPhase("roundEnd");
    }
    function onGameEndEvent({ players: final }) { onGameEnd?.(final); }

    socket.on("round-start", onRoundStart);
    socket.on("word-for-drawer", onWordForDrawer);
    socket.on("drawing-started", onDrawingStarted);
    socket.on("correct-guess", onCorrectGuess);
    socket.on("round-end", onRoundEnd);
    socket.on("game-end", onGameEndEvent);
    return () => {
      socket.off("round-start", onRoundStart);
      socket.off("word-for-drawer", onWordForDrawer);
      socket.off("drawing-started", onDrawingStarted);
      socket.off("correct-guess", onCorrectGuess);
      socket.off("round-end", onRoundEnd);
      socket.off("game-end", onGameEndEvent);
    };
  }, []);

  function chooseWord(word) {
    socket.emit("choose-word", { word });
    setMyWord(word);
    setWordChoices(null);
  }

  const overlays = (
    <>
      {phase === "choosing" && wordChoices && (
        <div className="word-choice-overlay">
          <p className="word-choice-label">Choose a word to draw:</p>
          <div className="word-choice-buttons">
            {wordChoices.map(w => (
              <button key={w} className="word-choice-btn" onClick={() => chooseWord(w)}>{w}</button>
            ))}
          </div>
        </div>
      )}
      {phase === "choosing" && !wordChoices && (
        <div className="word-choice-overlay">
          <p className="word-choice-label">{drawerName} is choosing a word…</p>
        </div>
      )}
      {phase === "roundEnd" && (
        <div className="round-end-overlay">
          <p className="round-end-label">The word was</p>
          <p className="round-end-word">{roundEndWord}</p>
          <p className="round-end-sub">Next round starting…</p>
        </div>
      )}
    </>
  );

  const playerPanel = <PlayerList players={players} drawerId={roundData?.drawerId} />;
  const guessPanel = <GuessPanel isDrawer={isDrawer} myId={socket.id} />;

  return (
    <div className="game">

      {/* ── Header ── */}
      <div className="game-header">
        <span className="game-logo">Limn</span>
        <div className="game-hint">
          <WordHint word={myWord} isDrawer={isDrawer} />
        </div>
        <div className="game-header-meta">
          <Timer key={roundData?.round} initial={roundData?.roundDuration ?? 80} />
          <span className={`game-role-badge ${isDrawer ? "role-draw" : "role-guess"}`}>
            {isDrawer ? "✏️" : "💬"}
          </span>
          <span className="game-round">{roundData?.round ?? 1}/{roundData?.totalRounds ?? 3}</span>
        </div>
      </div>

      {/* ── Desktop layout ── */}
      <div className="game-desktop">
        <aside className="game-left">{playerPanel}</aside>
        <div className="game-center">
          <div className="canvas-wrap">
            <Canvas isDrawer={isDrawer && phase === "drawing"} />
            {overlays}
          </div>
          <Toolbar isDrawer={isDrawer && phase === "drawing"} />
        </div>
        <aside className="game-right">{guessPanel}</aside>
      </div>

      {/* ── Mobile layout ── */}
      <div className="game-mobile">
        <div className="mobile-canvas-area">
          <div className="canvas-wrap">
            <Canvas isDrawer={isDrawer && phase === "drawing"} />
            {overlays}
          </div>
          <Toolbar isDrawer={isDrawer && phase === "drawing"} />
        </div>

        <nav className="mobile-tab-bar">
          {[{ id: "players", label: "Players" }, { id: "guess", label: "Guess" }].map(({ id, label }) => (
            <button
              key={id}
              className={`mobile-tab ${mobileTab === id ? "active" : ""}`}
              onClick={() => setMobileTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="mobile-panel-area">
          <div className={`mobile-panel ${mobileTab === "players" ? "active" : ""}`}>
            {playerPanel}
          </div>
          <div className={`mobile-panel ${mobileTab === "guess" ? "active" : ""}`}>
            {guessPanel}
          </div>
        </div>
      </div>

    </div>
  );
}
