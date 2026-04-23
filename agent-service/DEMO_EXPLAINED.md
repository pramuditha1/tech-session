# Tech Session: Audience Q&A, Gray Areas, and Explanations

This document answers **common questions** the audience may ask, clarifies **unclear or gray areas** in the demo, and gives **concise explanations** you can use during the session or in backup slides. It is based on the actual implementation and discussion from development and design.

---

## Part 1: Common Audience Questions

### Q1. What is this service? Is it “just a chat API”?

**Short answer:** It’s an **AI agent backend**: one HTTP endpoint that accepts chat messages, lets an LLM **reason and call tools** (e.g. add/list todos), runs those tools on your server, and streams the final answer back.

**Useful analogy:** User talks to an **assistant**; the assistant can ask **workers (tools)** to do things (e.g. add a todo). The assistant then uses the workers’ results to reply. The backend is the “manager” that coordinates the assistant (LLM) and the workers (your code).

---

### Q2. Why do we need a “loop”? What is ReAct?

**Short answer:** ReAct = **Reason + Act**. The LLM doesn’t just answer once; it can **decide to call a tool**, then **see the result** and decide again (call another tool or give the final answer). The loop is what lets the backend: call LLM → if tool_calls → run tools → send results back to LLM → repeat until the LLM responds with plain text only.

**In code:** `runReActLoop` in `agent-service/index.js`: a `for` loop (up to `MAX_ITERATIONS`) that calls `openai.responses.create()`, checks for `function_call` in the output, runs `executeTool()`, appends results to `input`, and calls the LLM again.

---

### Q3. How many times can the LLM be called in a single `/chat` request?

**Short answer:** Up to **10** times in this demo (`MAX_ITERATIONS = 10`). Usually it’s **1 or 2**: one call that might return tool calls, we execute them, then one more call that returns the final text.

**Why 10?** To avoid infinite loops (e.g. model keeps asking for tools). In production you’d tune this and add time/cost safeguards.

---

### Q4. How does the LLM “know” which tool to use (or to use none)?

**Short answer:** We send the LLM **instructions** (system prompt) and **tool schemas** (name, description, parameters). The model uses that to decide. It’s not keyword matching in our code; it’s the model’s interpretation.

- **Use a tool:** When the user intent matches a tool’s description (e.g. “add a todo” → `add_todo`).
- **Use no tool:** When the user just asks a question (“What can you do?”) or something that doesn’t fit any tool (“What’s the weather?”). Then the model responds with **text only**; we don’t run any tool and return that text.

**Inappropriate or off-topic input:** We didn’t add extra guardrails; behavior is whatever the base model does (refuse, redirect, or answer in scope). For production you’d add validation, content policy, or guardrails.

---

### Q5. What is “streaming” here? Is it token-by-token like ChatGPT?

**Short answer:** In this demo we **don’t** stream token-by-token from the LLM. We wait for the full reply (after the ReAct loop), then send it to the client in a **streaming-friendly way** (chunked, NDJSON): one line with the full text, then a “done” line. So the **protocol** is streaming (client can read incrementally), but the **content** is one chunk of text.

**Real token streaming** would require using the API’s streaming mode and piping each token to the client; that’s a natural next step. The current design keeps the client API stable so you can add real streaming later without changing the response format.

---

### Q6. What is `streamNdjson`? Does it use a library?

**Short answer:** It’s **plain JavaScript** (no streaming library). It uses Express’s `res`: `setHeader`, `flushHeaders`, `write`, `end`, and `JSON.stringify`. It sends two lines: `{"type":"text","content":"..."}` and `{"type":"done"}`. So the client gets a simple, streaming-style protocol (chunked, line-by-line) without any extra package.

---

### Q7. Why do we “append” tool calls and results back into the conversation?

**Short answer:** The LLM must **see** that it asked for a tool and what the tool **returned**, so it can say things like “Done, I added the todo.” We append the model’s own output (including `function_call` items) and our `function_call_output` to the `input` we send on the next round. Without that append, the model wouldn’t have the context to generate a proper final answer. So for **tool-using agents**, this append is required.

---

### Q8. If we add a new tool, do we have to change the prompt?

**Short answer:** We need to (1) add the tool to the **tools list** (e.g. `responsesApiTools`) and implement it in `executeTool`, and (2) **update the instructions** (system prompt) so the model knows when to use the new tool. The description in the tool schema helps, but a line in the prompt (“When the user asks X, use the Y tool”) makes behavior clearer.

**Different endpoint, different prompt:** Yes. You can have e.g. `POST /chat` (todos) and `POST /store-support` (ecommerce) with different instructions and different tools. Same ReAct pattern, different prompt and tool set per endpoint.

---

### Q9. User says “Add wash car, goto shop and read books.” What happens?

**Short answer:** The model may interpret this as **three todos** and return **multiple** `function_call` items (e.g. three `add_todo` calls). Our loop runs each one, appends all results to the conversation, then calls the LLM again. The second call usually produces the final summary (“I added 3 todos: …”). So we might get **2 LLM calls** for one user message. The model decides how to split; we don’t enforce “one todo per message.”

**Improvement for production:** A tool like `add_many_todos(titles[])` would let the model make **one** tool call instead of three, reducing latency and cost.

---

### Q10. What is “mock mode” (`USE_MOCK_LLM=1`)?

**Short answer:** When set, we **don’t call OpenAI**. A small regex-based path parses the last user message (e.g. “add todo …”, “list my todos”) and calls `executeTool` directly, then returns a canned reply. Useful for local testing, demos, or when you have no API quota. The same `/chat` contract (request/response) is preserved so the frontend doesn’t need to change.

---

### Q11. Why Responses API instead of Chat Completions?

**Short answer:** Our demo uses the **Responses API** (`/v1/responses`, e.g. with `gpt-5-nano`) because some API keys have quota for that product and not for Chat Completions. The pattern (tools, ReAct loop, streaming) is the same; only the request/response shape and SDK call differ. We kept the design so it works with the token the team has.

---

### Q12. Where do the todos live? What if we restart the server?

**Short answer:** Todos are **in-memory** in the Agent process (a `todos` array in `tools.js`). Restarting the server clears them. For production you’d use a database or another service; the tool implementation would call that instead of the in-memory array.

---

## Part 2: Gray Areas and Clarifications

### Gray 1: “Streaming” vs “real streaming”

- **Demo:** We stream the **final** answer as one or two chunks (NDJSON). The “typing” effect could be simulated on the client by revealing the string gradually.
- **Production:** True streaming would stream **tokens** from the LLM as they’re generated. Our current code doesn’t do that; it’s a deliberate simplification. The doc and session should say “we use a streaming-style response (chunked NDJSON)” and “token-level streaming can be added later.”

### Gray 2: Who decides “one todo vs many” in one message?

- The **LLM** decides. We don’t parse “Add A, B, C” in our code; we send the message to the model and it may return one or many `add_todo` calls. So behavior can vary by model and prompt. Mentioning “add_many_todos” as a production improvement helps set expectations.

### Gray 3: Inappropriate or off-topic input

- We didn’t implement input validation, content filters, or guardrails. The model may refuse, redirect, or answer within its default behavior. For the session, you can say: “We focus on the agent pattern; production would add validation and safety layers.”

### Gray 4: Cost and rate limits

- Each “turn” in the ReAct loop is one API call. A single `/chat` can trigger up to 10 calls. So cost scales with complexity. You can mention: “In production you’d add rate limiting, cost controls, and possibly fewer iterations or a single-call design for simple flows.”

### Gray 5: BFF vs Agent — who does what?

- **BFF:** Single entry for the frontend; forwards `/api/chat` (and optionally other routes) to the Agent; can add auth, logging, validation. **No** OpenAI key; no business logic.
- **Agent:** Runs the ReAct loop, calls the LLM, runs tools, streams the response. **Has** the OpenAI key and tool implementations. Clarifying this avoids “why is there a BFF?” questions.

---

## Part 3: One-Page Mental Model (for slides or handout)

**Pipeline:**

```
User sends message (POST /chat, body: { messages })
        │
        ▼
Agent receives request
        │
        ▼
ReAct loop:
  1. Send messages + tools + instructions to LLM
  2. LLM returns either:
     - Text only → return that text (streamed to client), done
     - Tool call(s) → run executeTool() for each
  3. Append tool results to conversation
  4. Send updated conversation back to LLM → repeat (up to MAX_ITERATIONS)
        │
        ▼
Stream final answer to client (NDJSON: text + done)
```

**Real-world analogy:** Customer (user) → Waiter (LLM) → Kitchen (tools) → Waiter brings result back and may ask kitchen again or give the final answer. Backend = manager coordinating waiter and kitchen.

---

## Part 4: Integrating More Data (e.g. knowledge bases, DBs, memcached)

**Typical approaches:**

1. **Tools:** Expose “workers” the LLM can call: e.g. `search_products`, `get_order`, `get_from_cache`. Each tool runs your code that queries DBs or memcached. The LLM decides when to call which tool. No need to put the whole knowledge base in the prompt.
2. **RAG (retrieve then generate):** For large text (e.g. product docs), index it (e.g. vector store); on each message retrieve relevant chunks and pass them as context in the prompt. The LLM answers using that context.
3. **Combine both:** Use RAG for product/content knowledge and tools for transactional or real-time data (orders, inventory, cache). One chat endpoint can use the same prompt to describe “use retrieved context for X and tools for Y.”

For the session you can say: “This demo uses two simple tools; in production you’d add tools that hit your databases and caches, and optionally RAG for large knowledge bases.”

---

## Part 5: Where This Fits in the Broader Session

- **Microservice patterns:** The Agent is one service; the BFF is the gateway. In production you’d add Circuit Breaker (e.g. for LLM calls), CQRS (e.g. for chat history), Database per service (e.g. Todo service with its own DB).
- **AI patterns:** We implement **tool use** and a **ReAct-style loop**. RAG, multi-agent, guardrails, observability are “on slides” as next steps.
- **Frontend:** Calls BFF only; keeps state for messages and tool results; consumes the stream (NDJSON). Deeper frontend patterns are high-level only.

Use this doc to prep for Q&A and to keep explanations consistent with the actual code and design.
