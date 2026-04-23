# Agent Service (Phase 1)

Single service that runs the **ReAct loop** with OpenAI: accepts chat messages, uses tools (`add_todo`, `list_todos`), and streams the final response. It uses the **Responses API** (`/v1/responses`) with model `gpt-5-nano` by default so tokens with Responses API quota work. Set `OPENAI_MODEL` in `.env` if needed.

- **Port:** 4000
- **Endpoint:** `POST /chat` — body `{ "messages": [ { "role": "user", "content": "..." } ] }`
- **Response:** NDJSON stream: `{ "type": "text", "content": "..." }` then `{ "type": "done" }`

## Prerequisites

1. **Node.js 18+**
2. **OpenAI API key** (optional if using mock) — [Create one](https://platform.openai.com/api-keys), then set in `.env`:
   ```bash
   cp .env.example .env
   # Edit .env and set OPENAI_API_KEY=sk-...
   ```
   If you hit **quota exceeded (429)**, add billing at [platform.openai.com](https://platform.openai.com) or use **mock mode** (no API calls):
   ```bash
   # In .env add:
   USE_MOCK_LLM=1
   ```

## Run

```bash
npm install
npm run dev
```

Then test:

```bash
curl -X POST http://localhost:4000/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Add a todo: buy milk"}]}' \
  --no-buffer
```

You should see NDJSON lines (text + done). Try: "List my todos" next.

## Run order (for full demo)

Start this service first, then BFF (3000), then Frontend (5173).
