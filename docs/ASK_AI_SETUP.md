# Ask AI setup

Ask AI works in **website data mode** without an AI credential. It answers common club, event, announcement, application, and registration questions from the same public club records returned by `GET /api/clubs`.

To enable generated responses, set these variables in the server environment or deployment settings:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | For generated answers | Unset | OpenAI API credential. Keep this server-side; never add it to browser code or commit it. |
| `OPENAI_MODEL` | No | `gpt-4.1-mini` | OpenAI model identifier. |

For local development, place them in the ignored `.env` file and restart the server. In production, add them to the hosting platform's server environment and redeploy. If the key is absent, Ask AI stays in website data mode. If an OpenAI request fails, the route returns a clearly labeled website-data answer instead of failing the chat.

Each request sends the current question, up to six recent user questions held in the open page, and up to eight matching public club/event/update snippets to OpenAI. This application does not save chat transcripts. Do not send credentials or private application information in a chat.

The endpoint is `POST /api/ask-ai`; `GET /api/ask-ai/status` reports only whether a key is configured. Requests are validated and limited to 20 per IP per minute in each running server instance. This in-memory limit is best-effort in serverless deployments where requests can reach different instances. The Vercel function is configured for a maximum 35-second duration so database initialization and a bounded provider request have time to finish. No database schema changes or new dependencies are needed.

The integration uses OpenAI's Responses API. The default model can be changed with `OPENAI_MODEL` to another model enabled for the configured API account.
