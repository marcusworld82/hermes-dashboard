> The app now uses [Composio MCP OAuth login](composio-mcp.md), with no API key form. This document describes the older REST transport retained for existing email queue connections. MCP sign-in alone does not enable that queue.

# Composio Gmail

Composio handles the Google sign-in screen and refreshes the Gmail tokens. This app keeps its existing review, self-test, reply checks, sending limits and durable queue.

## Server setup

In Settings, save a Composio project API key. The private setup route creates a managed Gmail auth config with `gmail.send` and `gmail.readonly` scopes unless you provide an existing config ID. No mailbox connects and no email sends during this step.

Environment overrides:

- `COMPOSIO_API_KEY`: private project API key.
- `COMPOSIO_GMAIL_AUTH_CONFIG_ID`: managed Gmail auth config ID.
- `COMPOSIO_USER_ID`: stable app user ID, defaults to `marcus-os`.
- `COMPOSIO_CALLBACK_URL`: defaults to `http://localhost:3200/api/gmail/composio/callback`. Use the actual app address. Public hosts require HTTPS.
- `GMAIL_PROVIDER`: `composio` by default, or `google` for the original direct Google OAuth setup.
- `GMAIL_TOKEN_ENCRYPTION_KEY`: required for private saved settings and the original token store.

The server never returns the saved API key to the browser. Gmail status returns readiness and missing setting names, never secrets. Existing direct Google connections keep using their saved Google tokens.

## Connect and verify

1. Connect Gmail. The server calls `POST /api/v3/connected_accounts/link` with the server auth config, stable user ID and browser-bound callback URL.
2. Complete Composio's hosted sign-in and approve send and read access.
3. The callback checks its saved ten-minute, single-use state and HttpOnly browser cookie. It loads the account ID saved when the flow began, ignoring account IDs in callback parameters.
4. The server verifies account ID, owning user, auth config, Gmail toolkit and ACTIVE status. Gmail's profile supplies the real sender address and history cursor.
5. Send a test to your own inbox, verify it, and resume the queue. Verification reads the full message, so metadata-only permission cannot pass.

Reconnecting removes the old self-test and cancels queued approvals. Approve those drafts again after verifying the new connection.

## Gmail transport

Composio requests use `POST /api/v3/tools/execute/proxy` with the bound `connected_account_id`, absolute Gmail endpoint, method and JSON body. Gmail raw messages, Message-ID, reply references and thread IDs retain their original values. No predefined send tool rewrites the draft.

The proxy's upstream status becomes `GmailHttpError`, including 404 for expired history cursors. The existing bounded inbox recovery still runs. Read failures block release. Neither the transport nor sender retries an uncertain send. Uncertain lead sends become `unknown` and pause the queue for review.

## Verification and limits

Automated fakes cover account swapping, wrong owner/config/toolkit, inactive accounts, expired state, browser mismatch, state reuse, exact raw body, status forwarding, read-scope denial, cursor recovery and uncertain sends. Original direct-Google queue tests remain in place.

Live Composio OAuth has not been tested without a configured API key and approved mailbox. The user must explicitly connect and request a self-test before live delivery is tested. A Composio project with optional callback identity verification enabled uses a separate `session_uri` verifier flow; this integration uses the ordinary Connect Link callback and does not complete that optional flow.

Official API references, checked 2026-10-20:

- [Create a new auth link session](https://docs.composio.dev/reference/v3/api-reference/connected-accounts/postConnectedAccountsLink)
- [Get connected account details](https://docs.composio.dev/reference/v3/api-reference/connected-accounts/getConnectedAccountsByNanoid)
- [Execute proxy request](https://docs.composio.dev/reference/v3/api-reference/tools/postToolsExecuteProxy)

These are the documented v3 REST endpoints. Composio's newer general reference also describes v3.1. Keep the tested request and response contract when migrating versions.
