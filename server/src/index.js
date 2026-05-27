import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { registerHandlers } from "./socket/handlers.js";

const PORT = process.env.PORT ?? 3001;
const CLIENT_URL = process.env.CLIENT_URL ?? "http://localhost:5173";

const app = express();
app.use(cors({ origin: CLIENT_URL }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_URL, methods: ["GET", "POST"] },
});

registerHandlers(io);

app.get("/health", (_, res) => res.json({ status: "ok" }));

httpServer.listen(PORT, () => {
  console.log(`Limn server running on port ${PORT} (clients from ${CLIENT_URL})`);
});
