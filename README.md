# Marcus OS

Canonical source: [marcusworld82/hermes-dashboard](https://github.com/marcusworld82/hermes-dashboard), branch **main**.

The repository keeps its original GitHub name. The application is named Marcus OS.

## Source layout

| Folder | Purpose |
| --- | --- |
| `src/`, `scripts/` | Mac app, local agents, integrations and workers |
| `cloud/` | Vercel app, private login, cloud gateway and saved views |
| `tests/` | Local app tests |
| `deployment/persistent-host/` | Always-on host deployment preparation |
| `docs/` | Integration and build documentation |

Vercel project `hermes-dashboard` uses this repository, production branch `main`, root directory `cloud`.
Production URL: https://hermes-dashboard-sandy.vercel.app

The old sibling `../cloud` folder is a legacy local copy. Make future cloud changes in this repository's `cloud/` folder.

## Run the Mac app

Use Node.js 24 or newer with native TypeScript and SQLite support.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3200. Configure local integration credentials privately. Existing installations should preserve their `.env.local` and local data.

```sh
npm run verify
npm run build
```

## Run the cloud app

```sh
cd cloud
npm ci
npm run dev
```

Cloud deployment needs the existing server-only login, bridge and private Blob environment variables. See [CLOUD-HOSTING.md](CLOUD-HOSTING.md). Never commit environment files, tokens, live data or private screenshots.

## Connections and limits

The cloud UI relays live actions to the Mac. Saved views remain readable while the Mac is offline. Live agent runs and local tools require the Mac to be awake and connected.

Composio MCP login is supported. A connected account does not by itself enable the background Gmail send queue. MCP queue transport remains unfinished; sending must remain disabled until that path is implemented and tested. See [Composio MCP notes](docs/composio-mcp.md).

Private test contacts can be excluded using the server-only `MARCUS_TEST_CONTACT_EMAILS` setting, a comma-separated list in `.env.local`.

Legacy `HERMES_*` environment names and launchd service identifiers remain for compatibility. They do not identify a separate app or repository.
