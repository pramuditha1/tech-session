/**
 * Agent service: POST /chat — ReAct loop with OpenAI (tool use), streams response.
 * Uses the Responses API (v1/responses) by default so tokens with Responses quota work (e.g. gpt-5-nano).
 * Port 4000. Requires OPENAI_API_KEY.
 */
import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import { responsesApiTools, executeTool } from "./tools.js";

const PORT = Number(process.env.PORT) || 4000;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5-nano";

function getOpenAIClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

const app = express();
app.use(express.json());

const SYSTEM_PROMPT = `You are a helpful task assistant. You can add and list todos using the provided tools.
When the user asks to add a todo, use add_todo with the title. When they ask to list or show todos, use list_todos.
Keep replies concise. After using a tool, briefly confirm what you did.`;

const MAX_ITERATIONS = 10;

/**
 * Run ReAct loop using the Responses API (v1/responses).
 * Input: array of { role, content }. On function_call in output, execute tools and call again.
 */
async function runReActLoop(messages, openai) {
  let input = messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user",
    content: m.content || "",
  }));

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await openai.responses.create({
      model: OPENAI_MODEL,
      input,
      tools: responsesApiTools,
      instructions: SYSTEM_PROMPT,
    });

    if (response.error) {
      throw new Error(response.error.message || "Model response error");
    }

    const hasFunctionCall = (response.output || []).some((item) => item.type === "function_call");
    if (hasFunctionCall) {
      input = [...input, ...(response.output || [])];
      for (const item of response.output || []) {
        if (item.type !== "function_call") continue;
        const name = item.name;
        let args = {};
        try {
          args = typeof item.arguments === "string" ? JSON.parse(item.arguments) : item.arguments || {};
        } catch {
          // ignore
        }
        const result = executeTool(name, args);
        input.push({
          type: "function_call_output",
          call_id: item.call_id,
          output: result,
        });
      }
      continue;
    }

    return response.output_text ?? "";
  }

  return "(Max iterations reached.)";
}

/**
 * Mock ReAct loop (no OpenAI): parse last user message for "add todo X" / "list todos" and run tools.
 * Set USE_MOCK_LLM=1 when you have no API quota — good for development and demos.
 */
async function runMockReActLoop(messages) {
  const last = messages[messages.length - 1];
  const text = (last?.content || "").toLowerCase().trim();
  const addMatch =
    text.match(/add\s+(?:a\s+)?todo[:\s]+(.+)/i) ||
    text.match(/(?:lets\s+)?add\s+(.+)/i) ||
    text.match(/todo[:\s]+(.+)/i);
  if (addMatch) {
    const title = addMatch[1].trim();
    executeTool("add_todo", { title });
    return `Done. I added the todo: "${title}".`;
  }
  if (/list|show|my\s+todos/.test(text)) {
    const out = executeTool("list_todos", {});
    const data = JSON.parse(out);
    if (!data.todos?.length) return "You have no todos yet. Ask me to add one.";
    const list = data.todos.map((t) => `- ${t.title}`).join("\n");
    return `Here are your todos:\n${list}`;
  }
  return "I can add or list todos. Try: \"Add a todo: buy milk\" or \"List my todos\".";
}

/**
 * Stream a string to the client as NDJSON: { type: "text", content } then { type: "done" }.
 * Append the finalContent to the end of the stream.
 * this is used to append all the content to the end of the stream.
 */
function streamNdjson(res, finalContent) {
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (obj) => {
    res.write(JSON.stringify(obj) + "\n");
    res.flush?.();
  };

  if (finalContent) {
    send({ type: "text", content: finalContent });
  }
  send({ type: "done" });
  res.end();
}

app.post("/chat", async (req, res) => {
  const messages = req.body?.messages;
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: "Missing or invalid body: { messages: [...] }" });
  }

  const useMock = process.env.USE_MOCK_LLM === "1" || process.env.USE_MOCK_LLM === "true";
  const openai = useMock ? null : getOpenAIClient();
  if (!useMock && !openai) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
  }

  try {
    const content = useMock
      ? await runMockReActLoop(messages)
      : await runReActLoop(messages, openai);
      // res.send({ type: "text", content: content });
    streamNdjson(res, content);
  } catch (err) {
    const status = err.status === 429 ? 429 : 500;
    const code = err.code || err.type;
    const message =
      code === "insufficient_quota"
        ? "OpenAI quota exceeded. Check your plan and billing at https://platform.openai.com. Or set USE_MOCK_LLM=1 to run without the API."
        : err.message || "Chat completion failed";
    if (status === 429 || code === "insufficient_quota") {
      console.error("Chat error (OpenAI quota):", message);
    } else {
      console.error("Chat error:", err.message);
    }
    res.status(status).json({ error: message, code: code || undefined });
  }
});

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "agent-service" });
});

app.listen(PORT, () => {
  console.log(`Agent service listening on http://localhost:${PORT}`);
  if (process.env.USE_MOCK_LLM === "1" || process.env.USE_MOCK_LLM === "true") {
    console.log("Using mock LLM (USE_MOCK_LLM=1); no OpenAI calls.");
  } else if (!process.env.OPENAI_API_KEY) {
    console.warn("Warning: OPENAI_API_KEY is not set; /chat will return 500.");
  }
});
