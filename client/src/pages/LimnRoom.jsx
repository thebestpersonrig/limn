import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getSocket, getSavedName, clearSession } from "../hooks/useSocket";
import Lobby from "./Lobby";
import Game from "./Game";
import GameEnd from "./GameEnd";

export default function LimnRoom({ sessionData }) {
  const { code } = useParams();
  const navigate = useNavigate();
  const [roomState, setRoomState] = useState(sessionData?.roomState || null);
  const [gamePhase, setGamePhase] = useState("lobby");
  const [roundData, setRoundData] = useState(null);
  const [finalPlayers, setFinalPlayers] = useState(null);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const playerName = getSavedName() || "Player";

  useEffect(() => {
    const socket = getSocket();

    function onRoomState(state) { setRoomState(state); }
    function onRoundStart(data) {
      setRoundData(data);
      setGamePhase("game");
    }
    function onGameEnd({ players }) {
      setFinalPlayers(players);
      setGamePhase("end");
      clearSession();
    }

    socket.on("room-state", onRoomState);
    socket.on("round-start", onRoundStart);
    socket.on("game-end", onGameEnd);

    return () => {
      socket.off("room-state", onRoomState);
      socket.off("round-start", onRoundStart);
      socket.off("game-end", onGameEnd);
    };
  }, []);

  // Auto-join if navigating via URL
  useEffect(() => {
    if (sessionData && sessionData.code === code.toUpperCase()) {
      setRoomState(sessionData.roomState);
      return;
    }
    if (joining) return;

    setJoining(true);
    setError("");

    const socket = getSocket();

    function doJoin() {
      socket.emit("join-room", { name: playerName, code: code.toUpperCase() });

      function onJoined({ code: roomCode, roomState: rs }) {
        socket.off("error", onErr);
        setJoining(false);
        setRoomState(rs);
      }
      function onErr({ message }) {
        socket.off("joined-room", onJoined);
        setJoining(false);
        setError(message);
      }

      socket.once("joined-room", onJoined);
      socket.once("error", onErr);
    }

    if (!socket.connected) {
      socket.connect();
      socket.once("connect", doJoin);
      socket.once("connect_error", () => {
        setJoining(false);
        setError("Can't reach the server.");
      });
    } else {
      doJoin();
    }
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleBack() {
    clearSession();
    navigate("/");
  }

  if (error) {
    return (
      <div className="home">
        <div className="home-card">
          <h1 className="home-title">Limn</h1>
          <p className="home-error">{error}</p>
          <div className="home-buttons">
            <button className="btn btn-primary" onClick={() => navigate("/limn")}>Back</button>
          </div>
        </div>
      </div>
    );
  }

  if (joining || !roomState) {
    return (
      <div className="home">
        <div className="home-card">
          <h1 className="home-title">Limn</h1>
          <p className="home-subtitle">Joining room {code.toUpperCase()}...</p>
        </div>
      </div>
    );
  }

  if (gamePhase === "end" && finalPlayers) {
    return (
      <GameEnd
        players={finalPlayers}
        onPlayAgain={() => { setGamePhase("lobby"); setFinalPlayers(null); }}
        onBackToHub={handleBack}
      />
    );
  }

  if (gamePhase === "game") {
    return <Game initialRoundData={roundData} />;
  }

  return (
    <Lobby
      code={code.toUpperCase()}
      roomState={roomState}
      playerName={playerName}
    />
  );
}
