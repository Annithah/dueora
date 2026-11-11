# DueOra AI

The same assistant for every customer. It knows **how DueOra works**; everything about a particular
workspace comes only from that workspace's own data (through tools) and its own memory.

## Where things live

| Part | File |
|---|---|
| Model (Gemini via `@google/genai`, backend only) | `backend/src/ai/model.ts` |
| System instructions (product rules, tone, hard rules) | `backend/src/ai/systemPrompt.ts` |
| Knowledge base (also the in-app FAQ) | `backend/src/ai/knowledge/*.md` |
| Tools (read) and proposals (write) | `backend/src/ai/tools.ts` |
| Running a confirmed action | `backend/src/ai/actions.ts` |
| Chat orchestration, streaming, rate limit, key redaction | `backend/src/ai/chat.ts` |
| Daily insight, weekly-digest line, smart forms | `backend/src/ai/insights.ts` |
| API (`/api/v1/ai/…`) | `backend/src/ai/routes.ts` |
| Evaluation cases | `backend/src/ai/evals/cases.ts` |
| Chat screen / settings | `mobile/src/app/(app)/ai.tsx`, `mobile/src/app/(app)/settings/ai.tsx` |

## How a message is answered

1. `POST /api/v1/ai/chat { conversationId?, message }` as the signed-in user, in their workspace.
   Refused with a clear message if an admin switched AI off (403), no key is configured (503 — "DueOra AI
   is resting right now…"), or the user sent `AI_MESSAGES_PER_HOUR` (default 30) messages this hour (429).
2. Any account reference pasted into the message is replaced with `[account reference hidden]` before it
   goes anywhere (matched by the key's keyed hash).
3. Gemini gets the system prompt + today's date, the workspace's timezone, name, companies, the user's role
   and first name, and the workspace's memory; plus the last 20 messages.
4. It calls **read tools** (list bills, overview, spending, compare months, forecast, insights,
   budgets, companies/categories, help search). These use the same services as the app's screens, so roles
   and workspace isolation apply. Tool results never contain account references.
5. For changes it calls **propose_… tools**. They change nothing: they return a confirmation card.
   Viewers are only offered the personal ones (snooze, mute). The reply streams to the phone (SSE).
6. The user taps **Confirm** → `POST /ai/messages/:id/actions/:actionId/confirm` runs it through the normal
   services with the normal permission checks. **Cancel** marks it cancelled. Each card works once.
7. Token usage is logged in `AiUsage`. If Gemini fails, the phone shows the "resting" message and the
   rest of the app keeps working.

## Teaching it more

1. **Rules and tone** — edit `backend/src/ai/systemPrompt.ts`.
2. **How-to answers** — add or edit a short article in `backend/src/ai/knowledge/` (`# Question?` then the
   answer). The in-app FAQ updates too. Keep it about DueOra, never about a customer.
3. **Workspace facts** — in the app: More → DueOra AI → *What the AI knows* ("we always pay by bank
   transfer", "'the canteen' means …"), or say "Remember that …" in the chat (confirmation card first).
4. **Feedback** — 👍/👎 under every answer. `npm run ai:review` (in `backend/`, with `DATABASE_URL` set)
   prints the disliked answers with their questions and comments; with `GEMINI_API_KEY` it also lists the
   common themes and suggested fixes.
5. **Evaluation** — `backend/src/ai/evals/cases.ts` holds 33 questions and commands from fictional
   organisations. `npm test` runs them with a scripted model (checks tools, confirmations, roles, key safety,
   isolation). `npm run ai:eval` runs them against the real Gemini model and prints the tool-choice score
   (it must stay ≥ 80%, and the safety checks must all pass).

## Configuration (backend `.env`)

| Variable | Default | Notes |
|---|---|---|
| `GEMINI_API_KEY` | — | From Google AI Studio. **Server only** — never in the app or the APK. Empty = AI off. |
| `GEMINI_MODEL` | `gemini-2.5-flash` | The fast "Flash" model. Change when Google releases a newer one. |
| `AI_MESSAGES_PER_HOUR` | `30` | Per user. |

Admins can switch DueOra AI off for their workspace in More → DueOra AI.
