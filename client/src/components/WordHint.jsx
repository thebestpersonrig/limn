import { useEffect, useState } from "react";
import { getSocket } from "../hooks/useSocket";
import "./WordHint.css";

// "_ _ _   _ _ _ _ _" → [["_","_","_"], ["_","_","_","_","_"]]
function parseHint(hint) {
  return hint.split(/\s{2,}/).map(word => word.split(" "));
}

export default function WordHint({ word, isDrawer }) {
  const [hint, setHint] = useState(null);
  const socket = getSocket();

  useEffect(() => {
    if (isDrawer && word) {
      setHint(null); // drawer sees word directly, not blanks
      return;
    }
    setHint(null);
    function onHint({ hint }) { setHint(hint); }
    socket.on("word-hint", onHint);
    return () => socket.off("word-hint", onHint);
  }, [isDrawer, word]);

  // Drawer: show the actual word as a badge
  if (isDrawer && word) {
    return (
      <div className="wh-drawer">
        <span className="wh-drawer-label">draw</span>
        <span className="wh-drawer-word">{word}</span>
      </div>
    );
  }

  // Waiting for round to start
  if (!hint) {
    return <div className="wh-empty">waiting…</div>;
  }

  const words = parseHint(hint);
  const totalLetters = words.reduce((s, w) => s + w.length, 0);

  return (
    <div className="wh-root">
      <div className="wh-words">
        {words.map((letters, wi) => (
          <span key={wi} className="wh-word">
            {letters.map((ch, li) => (
              <span key={li} className={`wh-letter ${ch !== "_" ? "wh-letter--known" : ""}`}>
                {ch !== "_" ? ch : ""}
              </span>
            ))}
          </span>
        ))}
      </div>
      <span className="wh-count">{totalLetters}</span>
    </div>
  );
}
