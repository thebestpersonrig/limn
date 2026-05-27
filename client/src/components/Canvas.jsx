import { useEffect, useRef } from "react";
import { getSocket } from "../hooks/useSocket";
import { toolState } from "../state/toolState";

function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function floodFill(ctx, canvas, startX, startY, fillHex) {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width, h = canvas.height;
  const sx = Math.floor(startX), sy = Math.floor(startY);
  if (sx < 0 || sx >= w || sy < 0 || sy >= h) return;

  const base = (sy * w + sx) * 4;
  const tR = data[base], tG = data[base+1], tB = data[base+2];
  const fill = hexToRgb(fillHex);
  if (tR === fill.r && tG === fill.g && tB === fill.b) return;

  const tol = 32;
  function match(i) {
    return Math.abs(data[i]  -tR)<=tol && Math.abs(data[i+1]-tG)<=tol && Math.abs(data[i+2]-tB)<=tol;
  }

  const visited = new Uint8Array(w * h);
  const stack = [sy * w + sx];
  while (stack.length) {
    const pos = stack.pop();
    if (visited[pos]) continue;
    const i4 = pos * 4;
    if (!match(i4)) continue;
    visited[pos] = 1;
    data[i4] = fill.r; data[i4+1] = fill.g; data[i4+2] = fill.b; data[i4+3] = 255;
    const px = pos % w, py = Math.floor(pos / w);
    if (px+1 < w)  stack.push(pos+1);
    if (px-1 >= 0) stack.push(pos-1);
    if (py+1 < h)  stack.push(pos+w);
    if (py-1 >= 0) stack.push(pos-w);
  }
  ctx.putImageData(imageData, 0, 0);
}

function applyImageData(ctx, canvas, dataUrl) {
  const img = new Image();
  img.onload = () => {
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };
  img.src = dataUrl;
}

export default function Canvas({ isDrawer }) {
  const canvasRef  = useRef(null);
  const previewRef = useRef(null);
  const drawing    = useRef(false);
  const startPos   = useRef(null);
  const lastPos    = useRef(null);
  const history    = useRef([]);
  const pending    = useRef([]);
  const rafId      = useRef(null);
  const socket     = getSocket();

  useEffect(() => {
    const canvas  = canvasRef.current;
    const preview = previewRef.current;
    const ctx     = canvas.getContext("2d");
    const pCtx    = preview.getContext("2d");

    function isVisible() { return canvas.offsetParent !== null; }

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (canvas.width  / rect.width),
        y: (e.clientY - rect.top)  * (canvas.height / rect.height),
      };
    }

    function saveHistory() {
      history.current.push(canvas.toDataURL("image/jpeg", 0.7));
      if (history.current.length > 20) history.current.shift();
    }

    function doClear() {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      pCtx.clearRect(0, 0, preview.width, preview.height);
      history.current = [];
    }

    function undo() {
      if (!isDrawer || !isVisible() || history.current.length === 0) return;
      const prev = history.current.pop();
      applyImageData(ctx, canvas, prev);
      socket.emit("canvas-undo", { imageData: prev });
    }

    function flushPending() {
      rafId.current = null;
      if (pending.current.length > 0) {
        socket.emit("draw-batch", pending.current.splice(0));
      }
    }

    function applyStroke(x0, y0, x1, y1, color, size, erase = false) {
      const prev = ctx.globalCompositeOperation;
      if (erase) {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = color;
      }
      ctx.lineWidth = size; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.globalCompositeOperation = prev;
    }

    function applyShape(targetCtx, type, x0, y0, x1, y1, color, size) {
      targetCtx.globalCompositeOperation = "source-over";
      targetCtx.strokeStyle = color;
      targetCtx.lineWidth   = size;
      targetCtx.lineCap     = "round";
      targetCtx.lineJoin    = "round";
      targetCtx.beginPath();
      if (type === "line") {
        targetCtx.moveTo(x0, y0); targetCtx.lineTo(x1, y1); targetCtx.stroke();
      } else if (type === "rect") {
        targetCtx.strokeRect(x0, y0, x1-x0, y1-y0);
      } else if (type === "circle") {
        const rx = Math.abs(x1-x0)/2, ry = Math.abs(y1-y0)/2;
        targetCtx.ellipse((x0+x1)/2, (y0+y1)/2, Math.max(rx,1), Math.max(ry,1), 0, 0, Math.PI*2);
        targetCtx.stroke();
      }
    }

    function onDown(e) {
      if (!isDrawer) return;
      const pos = getPos(e);
      const { color, size, mode } = toolState;

      if (mode === "fill") {
        saveHistory();
        floodFill(ctx, canvas, pos.x, pos.y, color);
        socket.emit("draw-fill", { x: pos.x, y: pos.y, color });
        return;
      }

      saveHistory();
      drawing.current  = true;
      startPos.current = pos;
      lastPos.current  = pos;
      // Keep pointer events flowing even if cursor leaves canvas
      if (e.pointerId != null) canvas.setPointerCapture(e.pointerId);
    }

    function onMove(e) {
      if (!isDrawer || !drawing.current) return;
      e.preventDefault();
      const pos = getPos(e);
      const { color, size, mode } = toolState;

      if (mode === "pen") {
        applyStroke(lastPos.current.x, lastPos.current.y, pos.x, pos.y, color, size, false);
        pending.current.push({ x0: lastPos.current.x, y0: lastPos.current.y, x1: pos.x, y1: pos.y, color, size });
        if (!rafId.current) rafId.current = requestAnimationFrame(flushPending);
      } else if (mode === "eraser") {
        applyStroke(lastPos.current.x, lastPos.current.y, pos.x, pos.y, "#ffffff", size, true);
        pending.current.push({ x0: lastPos.current.x, y0: lastPos.current.y, x1: pos.x, y1: pos.y, color: "#ffffff", size });
        if (!rafId.current) rafId.current = requestAnimationFrame(flushPending);
      } else if (mode === "line" || mode === "rect" || mode === "circle") {
        // Draw preview on overlay canvas — avoids expensive putImageData on main canvas each frame
        pCtx.clearRect(0, 0, preview.width, preview.height);
        applyShape(pCtx, mode, startPos.current.x, startPos.current.y, pos.x, pos.y, color, size);
      }
      lastPos.current = pos;
    }

    function onUp() {
      if (!drawing.current) return;
      const { color, size, mode } = toolState;
      if (isDrawer && lastPos.current && startPos.current &&
          (mode === "line" || mode === "rect" || mode === "circle")) {
        pCtx.clearRect(0, 0, preview.width, preview.height);
        applyShape(ctx, mode, startPos.current.x, startPos.current.y, lastPos.current.x, lastPos.current.y, color, size);
        socket.emit("draw-shape", {
          type: mode,
          x0: startPos.current.x, y0: startPos.current.y,
          x1: lastPos.current.x,  y1: lastPos.current.y,
          color, size,
        });
      }
      if (pending.current.length > 0) {
        if (rafId.current) { cancelAnimationFrame(rafId.current); rafId.current = null; }
        socket.emit("draw-batch", pending.current.splice(0));
      }
      drawing.current  = false;
      startPos.current = null;
      lastPos.current  = null;
    }

    function onKeyDown(e) {
      if (!isDrawer || !isVisible()) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); }
    }

    // Pointer events cover both mouse and touch with lower latency than mouse events
    canvas.addEventListener("pointerdown",   onDown);
    canvas.addEventListener("pointermove",   onMove,  { passive: false });
    canvas.addEventListener("pointerup",     onUp);
    canvas.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown",       onKeyDown);

    // ── Socket listeners ──────────────────────────────────
    function onDrawBatch(events) {
      events.forEach(({ x0, y0, x1, y1, color, size }) => applyStroke(x0, y0, x1, y1, color, size, false));
    }
    function onDrawShape({ type, x0, y0, x1, y1, color, size }) {
      applyShape(ctx, type, x0, y0, x1, y1, color, size);
    }
    function onDrawFill({ x, y, color }) { floodFill(ctx, canvas, x, y, color); }
    function onCanvasCleared()  { doClear(); }
    function onDrawingStarted() { doClear(); }
    function onCanvasRestore({ imageData }) { applyImageData(ctx, canvas, imageData); }
    function onSyncRequest({ forSocket }) {
      if (!isDrawer) return;
      socket.emit("canvas-sync", { imageData: canvas.toDataURL("image/jpeg", 0.85), forSocket });
    }

    socket.on("draw-batch",          onDrawBatch);
    socket.on("draw-shape",          onDrawShape);
    socket.on("draw-fill",           onDrawFill);
    socket.on("canvas-cleared",      onCanvasCleared);
    socket.on("drawing-started",     onDrawingStarted);
    socket.on("canvas-restore",      onCanvasRestore);
    socket.on("sync-canvas-request", onSyncRequest);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    window.__lmnUndo        = () => { if (isVisible()) undo(); };
    window.__lmnCanvasClear = () => { if (isVisible()) doClear(); };

    return () => {
      canvas.removeEventListener("pointerdown",   onDown);
      canvas.removeEventListener("pointermove",   onMove);
      canvas.removeEventListener("pointerup",     onUp);
      canvas.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown",       onKeyDown);
      socket.off("draw-batch",          onDrawBatch);
      socket.off("draw-shape",          onDrawShape);
      socket.off("draw-fill",           onDrawFill);
      socket.off("canvas-cleared",      onCanvasCleared);
      socket.off("drawing-started",     onDrawingStarted);
      socket.off("canvas-restore",      onCanvasRestore);
      socket.off("sync-canvas-request", onSyncRequest);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [isDrawer]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas
        ref={canvasRef}
        width={800}
        height={500}
        style={{
          display: "block",
          cursor: isDrawer ? "crosshair" : "default",
          background: "#fff",
          width: "100%",
          height: "100%",
          touchAction: "none",
        }}
      />
      <canvas
        ref={previewRef}
        width={800}
        height={500}
        style={{
          position: "absolute",
          top: 0, left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
