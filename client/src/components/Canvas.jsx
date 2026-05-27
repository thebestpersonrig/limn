import { useEffect, useRef } from "react";
import { getSocket } from "../hooks/useSocket";

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
  const w = canvas.width;
  const h = canvas.height;
  const sx = Math.floor(startX);
  const sy = Math.floor(startY);
  if (sx < 0 || sx >= w || sy < 0 || sy >= h) return;

  const base = (sy * w + sx) * 4;
  const tR = data[base], tG = data[base + 1], tB = data[base + 2];
  const fill = hexToRgb(fillHex);
  if (tR === fill.r && tG === fill.g && tB === fill.b) return;

  const tol = 32;
  function match(i) {
    return Math.abs(data[i]   - tR) <= tol &&
           Math.abs(data[i+1] - tG) <= tol &&
           Math.abs(data[i+2] - tB) <= tol;
  }

  const visited = new Uint8Array(w * h);
  const stack = [sy * w + sx];

  while (stack.length) {
    const pos = stack.pop();
    if (visited[pos]) continue;
    const i4 = pos * 4;
    if (!match(i4)) continue;
    visited[pos] = 1;
    data[i4]   = fill.r;
    data[i4+1] = fill.g;
    data[i4+2] = fill.b;
    data[i4+3] = 255;
    const px = pos % w;
    const py = Math.floor(pos / w);
    if (px + 1 < w)  stack.push(pos + 1);
    if (px - 1 >= 0) stack.push(pos - 1);
    if (py + 1 < h)  stack.push(pos + w);
    if (py - 1 >= 0) stack.push(pos - w);
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
  const canvasRef = useRef(null);
  const drawing   = useRef(false);
  const startPos  = useRef(null);
  const lastPos   = useRef(null);
  const snapshot  = useRef(null);
  const history   = useRef([]);
  const toolRef   = useRef({ color: "#000000", size: 7, mode: "pen" });
  const socket    = getSocket();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const src  = e.touches ? e.touches[0] : e;
      return {
        x: (src.clientX - rect.left) * (canvas.width  / rect.width),
        y: (src.clientY - rect.top)  * (canvas.height / rect.height),
      };
    }

    function saveHistory() {
      const url = canvas.toDataURL("image/jpeg", 0.7);
      history.current.push(url);
      if (history.current.length > 20) history.current.shift();
    }

    function undo() {
      if (!isDrawer || history.current.length === 0) return;
      const prev = history.current.pop();
      applyImageData(ctx, canvas, prev);
      socket.emit("canvas-undo", { imageData: prev });
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
      ctx.lineWidth   = size;
      ctx.lineCap     = "round";
      ctx.lineJoin    = "round";
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.globalCompositeOperation = prev;
    }

    function applyShape(type, x0, y0, x1, y1, color, size) {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color;
      ctx.lineWidth   = size;
      ctx.lineCap     = "round";
      ctx.lineJoin    = "round";
      ctx.beginPath();
      if (type === "line") {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      } else if (type === "rect") {
        ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      } else if (type === "circle") {
        const rx = Math.abs(x1 - x0) / 2;
        const ry = Math.abs(y1 - y0) / 2;
        ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    function onDown(e) {
      if (!isDrawer) return;
      const pos  = getPos(e);
      const { color, size, mode } = toolRef.current;

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
      if (mode === "line" || mode === "rect" || mode === "circle") {
        snapshot.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      }
    }

    function onMove(e) {
      if (!isDrawer || !drawing.current) return;
      e.preventDefault();
      const pos  = getPos(e);
      const { color, size, mode } = toolRef.current;

      if (mode === "pen") {
        applyStroke(lastPos.current.x, lastPos.current.y, pos.x, pos.y, color, size, false);
        socket.emit("draw", { x0: lastPos.current.x, y0: lastPos.current.y, x1: pos.x, y1: pos.y, color, size });
      } else if (mode === "eraser") {
        applyStroke(lastPos.current.x, lastPos.current.y, pos.x, pos.y, "#ffffff", size, true);
        socket.emit("draw", { x0: lastPos.current.x, y0: lastPos.current.y, x1: pos.x, y1: pos.y, color: "#ffffff", size });
      } else if (snapshot.current) {
        ctx.putImageData(snapshot.current, 0, 0);
        applyShape(mode, startPos.current.x, startPos.current.y, pos.x, pos.y, color, size);
      }
      lastPos.current = pos;
    }

    function onUp() {
      if (!drawing.current) return;
      const { color, size, mode } = toolRef.current;
      if (isDrawer && snapshot.current && lastPos.current && startPos.current &&
          (mode === "line" || mode === "rect" || mode === "circle")) {
        ctx.putImageData(snapshot.current, 0, 0);
        applyShape(mode, startPos.current.x, startPos.current.y, lastPos.current.x, lastPos.current.y, color, size);
        socket.emit("draw-shape", {
          type: mode,
          x0: startPos.current.x, y0: startPos.current.y,
          x1: lastPos.current.x,  y1: lastPos.current.y,
          color, size,
        });
      }
      drawing.current  = false;
      startPos.current = null;
      snapshot.current = null;
      lastPos.current  = null;
    }

    function onKeyDown(e) {
      if (!isDrawer) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); }
    }

    canvas.addEventListener("mousedown",  onDown);
    canvas.addEventListener("mousemove",  onMove);
    canvas.addEventListener("mouseup",    onUp);
    canvas.addEventListener("mouseleave", onUp);
    canvas.addEventListener("touchstart", onDown, { passive: true });
    canvas.addEventListener("touchmove",  onMove, { passive: false });
    canvas.addEventListener("touchend",   onUp);
    window.addEventListener("keydown", onKeyDown);

    // ── Socket listeners ────────────────────────────────────
    function onDrawUpdate({ x0, y0, x1, y1, color, size }) {
      applyStroke(x0, y0, x1, y1, color, size, false);
    }
    function onDrawShape({ type, x0, y0, x1, y1, color, size }) {
      applyShape(type, x0, y0, x1, y1, color, size);
    }
    function onDrawFill({ x, y, color }) {
      floodFill(ctx, canvas, x, y, color);
    }
    function onCanvasCleared() {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      history.current = [];
    }
    function onCanvasRestore({ imageData }) {
      applyImageData(ctx, canvas, imageData);
    }
    function onSyncRequest({ forSocket }) {
      if (!isDrawer) return;
      socket.emit("canvas-sync", { imageData: canvas.toDataURL("image/jpeg", 0.85), forSocket });
    }

    socket.on("draw-update",          onDrawUpdate);
    socket.on("draw-shape",           onDrawShape);
    socket.on("draw-fill",            onDrawFill);
    socket.on("canvas-cleared",       onCanvasCleared);
    socket.on("canvas-restore",       onCanvasRestore);
    socket.on("sync-canvas-request",  onSyncRequest);

    // Fill white on mount
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Expose undo for toolbar button
    window.__lmnUndo = undo;

    return () => {
      canvas.removeEventListener("mousedown",  onDown);
      canvas.removeEventListener("mousemove",  onMove);
      canvas.removeEventListener("mouseup",    onUp);
      canvas.removeEventListener("mouseleave", onUp);
      canvas.removeEventListener("touchstart", onDown);
      canvas.removeEventListener("touchmove",  onMove);
      canvas.removeEventListener("touchend",   onUp);
      window.removeEventListener("keydown", onKeyDown);
      socket.off("draw-update",         onDrawUpdate);
      socket.off("draw-shape",          onDrawShape);
      socket.off("draw-fill",           onDrawFill);
      socket.off("canvas-cleared",      onCanvasCleared);
      socket.off("canvas-restore",      onCanvasRestore);
      socket.off("sync-canvas-request", onSyncRequest);
    };
  }, [isDrawer]);

  useEffect(() => { window.__lmnTool = toolRef.current; }, []);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={500}
      style={{ display: "block", cursor: isDrawer ? "crosshair" : "default", background: "#fff", width: "100%", height: "100%" }}
    />
  );
}
