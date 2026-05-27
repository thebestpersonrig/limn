import { useEffect, useState } from "react";
import { getSocket } from "../hooks/useSocket";
import "./Timer.css";

export default function Timer({ initial = 80 }) {
  const [timeLeft, setTimeLeft] = useState(initial);
  const socket = getSocket();

  useEffect(() => {
    setTimeLeft(initial);
    function onTick({ timeLeft }) {
      setTimeLeft(timeLeft);
    }
    socket.on("timer-tick", onTick);
    return () => socket.off("timer-tick", onTick);
  }, [initial]);

  const pct = (timeLeft / 80) * 100;
  const urgent = timeLeft <= 15;

  return (
    <div className="timer">
      <span className={`timer-number ${urgent ? "urgent" : ""}`}>{timeLeft}</span>
      <div className="timer-bar-bg">
        <div
          className={`timer-bar ${urgent ? "urgent" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
