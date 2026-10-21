# Composio account sign-in

Open Marcus OS at `http://localhost:3200/settings/gmail` and select **Connect Composio**. The app opens Composio's own OAuth screen. No Composio API key is required.

The fixed MCP endpoint is `https://connect.composio.dev/mcp`. The official MCP SDK discovers OAuth metadata, dynamically registers a public client, uses a PKCE S256 challenge, and exchanges the callback code. The server then initializes MCP and lists its available tools. The connection is marked verified only when `COMPOSIO_SEARCH_TOOLS` and `COMPOSIO_MANAGE_CONNECTIONS` are present. Verification does not execute Gmail actions or send mail.

## Server configuration

`GMAIL_TOKEN_ENCRYPTION_KEY` must be the existing private 32-byte base64 encryption key. Keep it stable across server restarts. OAuth client information, tokens and pending login verifiers are encrypted in `data/composio-mcp.enc`, or the configured `HERMES_DATA_DIR`. The file is written with mode 0600 through an atomic rename. Do not share the key or decrypted credentials.

`COMPOSIO_MCP_CALLBACK_URL` defaults to `http://localhost:3200/api/composio/mcp/callback`. The app must be opened on the same origin as the callback. For a different deployment, set the complete HTTPS callback URL before signing in. HTTP is accepted only on localhost or 127.0.0.1. Existing registered redirect URLs are specific to that configuration. If changing hosts after registration, preserve the old encrypted file privately and reconnect with a fresh OAuth registration.

## Routes

- `POST /api/composio/mcp/connect` requires the matching Origin header. Returns `{url}` and a 10-minute HttpOnly, SameSite=Lax browser cookie. HTTPS callbacks also set Secure.
- `GET /api/composio/mcp/callback` consumes the state once, checks its expiry and browser binding, exchanges the code, and verifies the MCP tool list. Redirects to Gmail settings with `composio=connected` or `composio=error`. It clears the browser cookie.
- `GET /api/composio/mcp/status` returns connection and verification flags without credentials. This is the last verified state, not a network health probe.

The encrypted store supports a single running Node server process. A shared in-process queue serializes login, callback and refresh operations across Next.js module instances. Do not run multiple app processes against the same credential file.

The callback is bound to server-generated state and a separate browser secret. Pending state expires after ten minutes. The server accepts only known Composio metadata and endpoint URLs. Network redirects are rejected, including token requests. Errors returned to the browser do not include upstream response bodies.

`callComposioMcpTool(name,args)` returns the SDK tool result. It allows the documented Composio meta tools only and refreshes tokens when needed. Calling this helper still requires the caller to enforce user authorization for the chosen action. No route exposes arbitrary tool execution. The OAuth login flow itself only lists tools.

## Verification

`node --test tests/composio-mcp.test.mjs` exercises the official SDK against a fake OAuth and MCP service. It covers PKCE, callback browser binding, expiry, reuse, encrypted persistence, credential redaction, refresh, dynamic registration reuse, and malicious metadata rejection. Live registration and authorization URL creation were also checked. Account authorization must finish in the user's browser before the app can report a verified connection.

## Gmail account check

After login, **Check Gmail connection** reads Composio connection metadata with `COMPOSIO_SEARCH_TOOLS`. It does not read inbox messages or send email. If no active Gmail account is reported, **Connect Gmail in Composio** requests an authorization link. The user opens it, completes Gmail consent, returns to Marcus OS and checks again. Foreign authorization hosts and incomplete tool results are rejected.

The MCP login is separate from the durable mail queue. The existing queue expects raw Gmail headers and bounded history recovery. Its legacy direct Google and Composio REST transports remain intact; this change does not silently replace them with a different MCP send tool. No queue mailbox is selected and no emails are approved by MCP sign-in.
