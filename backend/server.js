import { loadEnv } from "./src/utils/loadEnv.js";
loadEnv();

import http from "node:http";
import { Router } from "./src/utils/router.js";
import { cors, jsonBodyParser } from "./src/middleware.js";
import { sendJson } from "./src/utils/http.js";
import { registerAuthRoutes } from "./src/routes/authRoutes.js";
import { registerTaskRoutes } from "./src/routes/taskRoutes.js";
import { registerUserRoutes } from "./src/routes/userRoutes.js";
import "./src/db.js"; // ensures schema exists before the first request

if (!process.env.JWT_SECRET) {
  console.error(
    "JWT_SECRET is not set. Copy backend/.env.example to backend/.env and set a real secret before starting the server."
  );
  process.exit(1);
}

const router = new Router();
registerAuthRoutes(router);
registerTaskRoutes(router);
registerUserRoutes(router);

router.get("/api/health", async (req, res) => {
  sendJson(res, 200, { status: "ok", time: new Date().toISOString() });
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  await cors(req, res, async () => {
    if (res.writableEnded) return;
    await jsonBodyParser(req, res, async () => {
      const matched = await router.handle(req, res, url.pathname);
      if (!matched && !res.writableEnded) {
        sendJson(res, 404, { error: "Not found" });
      }
    });
  });
});

const PORT = process.env.PORT || 5175;
server.listen(PORT, () => {
  console.log(`Task board API listening on http://localhost:${PORT}`);
});