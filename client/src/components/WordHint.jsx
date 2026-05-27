import { useEffect, useState } from "react";
import { getSocket } from "../hooks/useSocket";
import "./WordHint.css";

export default function WordHint({ word, isDrawer }) {
  const [hint, setHint] = useState("");
  const socket = getSocket();

  useEffect(() => {
    if (isDrawer && word) {
      setHint(word);
      return;
    }
    setHint("");
    function onHint({ hint }) {
      setHint(hint);
    }
    socket.on("word-hint", onHint);
    return () => socket.off("word-hint", onHint);
  }, [isDrawer, word]);

  if (!hint) return <div className="word-hint word-hint--empty">Waiting for word…</div>;

  return (
    <div className="word-hint">
      {isDrawer ? (
        <span className="word-hint__word">{hint}</span>
      ) : (
        hint.split("").map((ch, i) => (
          <span key={i} className={ch === "_" ? "word-hint__blank" : ch === " " ? "word-hint__space" : "word-hint__letter"}>
            {ch === "_" ? "_" : ch === " " ? "  " : ch}
          </span>
        ))
      )}
    </div>
  );
}
