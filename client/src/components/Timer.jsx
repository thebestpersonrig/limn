import { useEffect, useState } from "react";
import { getSocket } from "../hooks/useSocket";
import "./Timer.css";

export default function Timer({ initial = 80 }) {
  const [timeLeft, setTimeLeft] = useState(initial);
  const socket = getSocket();

  useEffect(() => {
    setTimeLeft(initial);
    function onTick({ timeLeft }) { setTimeLeft(timeLeft); }
    function onDrawingStarted()   { setTimeLeft(initial); }
    socket.on("timer-tick",       onTick);
    socket.on("drawing-started",  onDrawingStarted);
    return () => {
      socket.off("timer-tick",      onTick);
      socket.off("drawing-started", onDrawingStarted);
    };
  }, [initial]);

  const pct    = (timeLeft / initial) * 100;
  const urgent = timeLeft <= 15;

  return (
    <div className="timer">
      <span className={`timer-number ${urgent ? "urgent" : ""}`}>{timeLeft}</span>
      <div className="timer-bar-bg">
        <div className={`timer-bar ${urgent ? "urgent" : ""}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
