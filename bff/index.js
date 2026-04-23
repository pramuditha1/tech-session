/**
 * BFF (Backend For Frontend) / API Gateway
 *
 * This service is the single entry point for the frontend. It does not call the LLM
 * or run any business logic—it only forwards chat requests to the Agent service.
 *
 * Flow:
 *   1. Frontend sends POST /api/chat with { messages: [...] }
 *   2. BFF validates the body and forwards the same payload to the Agent (e.g. http://localhost:4000/chat)
 *   3. Agent runs the LLM + tools and streams NDJSON back
 *   4. BFF pipes that stream straight through to the frontend (no buffering)
 *
 * Why use a BFF? The frontend never talks to the Agent directly. In production you'd add
 * auth, rate limiting, or logging here; the Agent stays focused on the ReAct loop and tools.
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const AGENT_URL = process.env.AGENT_URL || "http://localhost:4000/chat";

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "bff", agentUrl: AGENT_URL });
});

app.post("/api/chat", (req, res) => {
  const messages = req.body?.messages;
  if (!Array.isArray(messages)) {
    return res
      .status(400)
      .json({ error: "Missing or invalid body: { messages: [...] }" });
  }

  const agentUrl = new URL(AGENT_URL);

  const options = {
    hostname: agentUrl.hostname,
    port: agentUrl.port || 80,
    path: agentUrl.pathname,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  };

  const agentReq = http.request(options, (agentRes) => {
    res.status(agentRes.statusCode || 500);
    // Forward streaming headers
    if (agentRes.headers["content-type"]) {
      res.setHeader("Content-Type", agentRes.headers["content-type"]);
    }
    if (agentRes.headers["transfer-encoding"]) {
      res.setHeader(
        "Transfer-Encoding",
        agentRes.headers["transfer-encoding"],
      );
    }
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    agentRes.pipe(res);
  });

  agentReq.on("error", (err) => {
    console.error("Error proxying to agent:", err);
    if (!res.headersSent) {
      res
        .status(502)
        .json({ error: "Failed to reach agent service", details: err.message });
    } else {
      res.end();
    }
  });

  agentReq.write(JSON.stringify({ messages }));
  agentReq.end();
});

app.listen(PORT, () => {
  console.log(`BFF listening on http://localhost:${PORT}`);
  console.log(`Proxying /api/chat to ${AGENT_URL}`);
});

