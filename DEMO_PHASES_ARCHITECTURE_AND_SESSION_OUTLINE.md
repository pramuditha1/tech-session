# Demo: Phases, Architecture, and Session Outline

Single reference for the tech session: **demo project phases and architecture**, **session outline** (microservice + AI patterns, combined), and **BFF vs Next.js** recommendation.

**Session:** 45 min | Option A (2 backend services) | Enterprise/common patterns  
**Audience:** Software engineers, leads, architects, QE engineers  
**Goal:** Present microservice and AI design patterns; show how they combine; demo BFF → Agent with tool use and streaming.

---

## 1. Demo Project Phases

| Phase | Scope | Status | Exit criterion |
|-------|--------|--------|----------------|
| **Phase 1 – Agent service** | Node + Express on port 4000. `POST /chat` with body `{ messages }`. OpenAI Responses API (e.g. gpt-5-nano). Tools: `add_todo`, `list_todos` (in-memory). ReAct loop; NDJSON stream response. | **Done** | Curl to `http://localhost:4000/chat` returns stream; add/list todo work. |
| **Phase 2 – BFF** | Node + Express on port 3000. `POST /api/chat` forwards body to Agent `http://localhost:4000/chat` and pipes stream back. Optional: logging/validation. | Pending | Curl to `http://localhost:3000/api/chat` returns same stream as Phase 1. |
| **Phase 3 – Frontend** | Vite + React + TypeScript. Single BFF base URL (e.g. `http://localhost:3000`). Chat UI: input, message list, streaming display. State: messages, loading, error. Optional: Todos panel. | Pending | E2E: type in UI → BFF → Agent → stream; add/list todo visible. |
| **Phase 4 – Polish (optional)** | README (prerequisites, run order), root `npm run dev` (e.g. concurrently), styling. | Optional | One-command run; clear docs. |

**Run order:** Agent (4000) → BFF (3000) → Frontend (5173 or 3000 if using Next.js).

---

## 2. Demo Architecture

```
[Frontend – Vite+React or Next.js]
      │
      │ POST /api/chat  (streaming response)
      ▼
[BFF / API Gateway]     ← Service 1: single entry, proxy to Agent
      │
      │ POST /chat → Agent
      ▼
[Agent Service]         ← Service 2: ReAct loop, tools, LLM
      │
      ▼
[OpenAI API]
```

**Ports (separate BFF + frontend):**

| Layer   | Port | Role |
|---------|------|------|
| Frontend | 5173 (Vite default) | UI; calls BFF only |
| BFF      | 3000 | Proxy `/api/*` → Agent |
| Agent    | 4000 | Chat + tools + streaming |

**Implemented in demo**

- **BFF:** Single entry; forwards `/api/chat` to Agent; streams response back. No OpenAI key; no business logic.
- **Agent:** ReAct loop; tool use (`add_todo`, `list_todos`); in-memory todos; NDJSON stream.
- **Frontend:** BFF client; message state; streaming UX; separation of concerns (API layer vs UI).

**On slides only (not in code)**

- Microservice: Circuit Breaker, CQRS, Saga, Database per service.
- AI: RAG, multi-agent, guardrails, observability.

---

## 3. Session Outline (45 min)

| Part | Content | Time |
|------|---------|------|
| **1. Microservice design patterns** | API Gateway/BFF, Circuit Breaker, CQRS, Saga, Database per service. When to use; one line on DDD, observability. | 10 min |
| **2. AI-driven design patterns** | Tool use / function calling, ReAct (reason → act → observe), RAG. Optional: multi-agent (coordinator). | 10 min |
| **3. Integration** | One system: Frontend → BFF → Agent → LLM. Where each pattern family applies; demo preview. | 5 min |
| **4. Demo** | Live: Frontend → BFF → Agent. Tool use (add/list todo), streaming. BFF vs Agent; frontend patterns (high-level). | 12 min |
| **5. Q&A** | — | 8 min |

---

## 4. Microservice Design Patterns (Commonly Used / Trending)

| Pattern | Purpose | When to use | In our demo |
|--------|---------|-------------|-------------|
| **API Gateway / BFF** | Single entry; routing, auth, rate limit, aggregation | All microservice front-doors | ✅ BFF forwards to Agent |
| **Circuit Breaker** | Stop calling a failing dependency after threshold; fail fast | LLM API, DB, downstream APIs | Slides: “We’d add for Agent → LLM” |
| **CQRS** | Separate read/write models or APIs | Chat history vs mutations; high read load | Slides only |
| **Saga** | Distributed transactions across services | Order + payment + inventory flows | Slides only |
| **Database per service** | One data store per service | True service boundaries | Slides: “When Todo becomes its own service” |
| **Service mesh** | Traffic, mTLS, observability at network layer | Many services | — |
| **Strangler fig** | Route new features to new services; migrate off monolith | Migration | — |

**Trends:** DDD (bounded contexts), async/events, observability and health checks, containerization + CI/CD.

---

## 5. AI Design Patterns (Commonly Used / Trending)

### Implemented in demo

| Pattern | Description | Our demo |
|--------|-------------|----------|
| **Tool use / function calling** | LLM chooses and invokes named tools with structured args | `add_todo`, `list_todos` |
| **ReAct (Reason + Act)** | Loop: reason → act (tool) → observe → repeat until done | Agent service ReAct loop |

### On slides only

| Pattern | Description | When to use |
|--------|-------------|-------------|
| **RAG** | Retrieve relevant chunks, then generate with that context | Q&A over docs, knowledge bases |
| **Multi-agent (coordinator)** | Central agent routes to specialist agents | Customer support, complex routing |
| **Semantic router** | Lightweight classifier before main agent | Reduce cost/latency |
| **Guardrails** | Input/output validation, PII/safety, rate limits | Production safety |
| **Observability** | Trace LLM/tool calls; token/cost metrics; evals | Production ops |

### Reference (full landscape)

- **Single-agent:** ReAct, tool use, semantic router, reflexion/self-critique, chain-of-thought.
- **Multi-agent:** Sequential, parallel, coordinator, loop, review & critique.
- **RAG / retrieval:** RAG, agentic RAG, hybrid search.
- **Cross-cutting:** Guardrails, observability, caching, human-in-the-loop, structured output.

---

## 6. How Patterns Combine in One Solution

**In our system:**

1. **Microservice side**
   - **BFF** = API Gateway for the frontend: one entry, proxy to Agent.
   - **Agent** = one backend service; could later be split (e.g. Todo service with its own DB).
   - **Production:** Circuit Breaker around Agent → LLM; CQRS if we separate chat reads/writes; Database per service when we extract Todo.

2. **AI side**
   - **Agent service** = single-agent with tool use and ReAct.
   - **Tools** = the “workers” (add/list todo); in production: DB, APIs, search.
   - **Production:** RAG for knowledge; multi-agent for routing; guardrails and observability.

3. **Integration**
   - Frontend talks only to BFF (BFF client pattern).
   - BFF has no LLM; Agent has the key and the loop.
   - One request flow: User → Frontend → BFF → Agent → (tools + LLM) → stream back.

**Narrative for session:** “We implement BFF and Agent as two services; we use tool use and ReAct in the Agent. The same system could add Circuit Breaker, CQRS, RAG, and multi-agent as we scale—patterns on slides show where they fit.”

---

## 7. BFF + Frontend: Separate Repos vs Next.js

### Option A: Separate BFF and Frontend (recommended for this demo)

**Setup:**  
- **Repo 1:** Agent service (done).  
- **Repo 2:** BFF — Node/Express, port 3000, proxy `/api/chat` → Agent.  
- **Repo 3:** Frontend — Vite + React + TypeScript, port 5173, calls `http://localhost:3000`.

**Pros**

- Matches the session narrative exactly: “2 services” (BFF + Agent) plus Frontend.
- Clear separation: three runnables, three ports; easy to draw and explain.
- BFF is obviously its own service (API Gateway pattern).
- Same structure as in SESSION_PLAN and DEMO_ARCHITECTURE_AND_PATTERNS.

**Cons**

- Three processes to run (or one root script that starts BFF + Agent + Vite).
- Two “front” codebases (BFF + frontend) if you count BFF and frontend as separate repos.

**Verdict:** **Best for the 45-min session** so the audience sees BFF and Agent as distinct services and the flow Frontend → BFF → Agent is unambiguous.

---

### Option B: Next.js with API Routes (BFF inside Next.js)

**Setup:**  
- **Repo 1:** Agent service (unchanged).  
- **Repo 2:** Next.js app — pages/app for UI; `pages/api/chat` (or App Router route handler) that proxies to the Agent and streams the response. So “BFF” = Next.js API routes.

**Pros**

- Fewer repos and fewer processes (Next.js + Agent).
- One app to open for “frontend + API”; good for quick local dev.
- Still demonstrates “frontend never talks to Agent directly; it goes through an API layer.”

**Cons**

- BFF is no longer a separate deployable service; it’s colocated with the frontend.
- “2 services” becomes “2 runnables” (Next.js, Agent) with BFF as part of Next.js—slightly weaker for teaching “BFF as its own service.”

**Verdict:** **Reasonable if** you prefer fewer moving parts and are okay saying “the BFF is this Next.js API route that forwards to the Agent.” Slightly less aligned with the written “2 services” plan.

---

### Recommendation

- **For this demo and session:** Use **separate BFF (Express) and Frontend (Vite + React)** so the architecture (Frontend → BFF → Agent) and the “BFF as API Gateway” pattern are clear and match the docs.
- **If you prefer simplicity over strict “2 services”:** Next.js with API routes as BFF is acceptable; just state explicitly that “the BFF lives in these API routes” and that in a larger system it could be split out.

---

## 8. One-Sentence Summary

**“Enterprise microservice and AI design patterns in 45 minutes: common patterns on slides, a 2-service demo (BFF → Agent with tool use and streaming), and high-level frontend patterns.”**

---

## 9. References

- **SESSION_PLAN.md** — Full 45-min breakdown, slide outline, 2-day prep, frontend (high-level).
- **DEMO_ARCHITECTURE_AND_PATTERNS.md** — In-demo vs on-slides mapping, pattern tables, resources.
- **REVISED_SESSION_PROPOSAL.md** — Locked session structure and decisions.
