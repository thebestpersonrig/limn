import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { registerHandlers } from "./socket/handlers.js";

const PORT = 3001;

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "http://localhost:5173", methods: ["GET", "POST"] },
});

registerHandlers(io);

app.get("/health", (_, res) => res.json({ status: "ok" }));

httpServer.listen(PORT, () => {
  console.log(`Limn server running on http://localhost:${PORT}`);
});
