import { useEffect, useRef } from "react";
import { useKartStore } from "./kartStore";

const keys = new Set();

export function useKartControls(enabled) {
  const setInput = useKartStore((state) => state.setInput);
  const sequence = useRef(0);

  useEffect(() => {
    if (!enabled) return undefined;

    function down(event) {
      keys.add(event.code);
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
        event.preventDefault();
      }
    }
    function up(event) {
      keys.delete(event.code);
    }
    function pointerDown() {
      keys.add("MouseFire");
    }
    function pointerUp() {
      keys.delete("MouseFire");
    }

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("pointerdown", pointerDown);
    window.addEventListener("pointerup", pointerUp);

    let frame = 0;
    function update() {
      sequence.current += 1;
      setInput({
        sequence: sequence.current,
        throttle: Number(keys.has("KeyW") || keys.has("ArrowUp")) - Number(keys.has("KeyS") || keys.has("ArrowDown")),
        steer: Number(keys.has("KeyA") || keys.has("ArrowLeft")) - Number(keys.has("KeyD") || keys.has("ArrowRight")),
        drift: keys.has("ShiftLeft") || keys.has("ShiftRight"),
        boost: keys.has("Space"),
        fire: keys.has("KeyE") || keys.has("MouseFire"),
      });
      frame = requestAnimationFrame(update);
    }
    frame = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("pointerdown", pointerDown);
      window.removeEventListener("pointerup", pointerUp);
      keys.clear();
    };
  }, [enabled, setInput]);
}
