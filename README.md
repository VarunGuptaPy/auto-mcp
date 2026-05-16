# auto-mcp

Reverse-engineer any web app into an MCP server, automatically.

## Web app (recommended)

The quickest way to use auto-mcp is via the web interface — paste a URL, watch the agent explore in real time, download a ready-to-run MCP server.

### One-command start (Docker)

```bash
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY=sk-ant-...
docker compose up
```

Open http://localhost:8000, paste a URL (e.g. `https://news.ycombinator.com`), and go.

### Local dev (without Docker)

```bash
pip install -r requirements.txt
playwright install chromium
export ANTHROPIC_API_KEY=sk-ant-...
make dev
# → http://localhost:8000
```

### Running tests

```bash
make test
# or individually:
make test-security   # SSRF guards
make test-jobs       # state machine + concurrency cap
make test-runner     # pipeline integration (mocked engine)
```

### Web app endpoints

| Endpoint | Description |
|---|---|
| `POST /api/jobs` | Submit a URL; returns `{job_id}`. Rate-limited: 1/5 min per IP. |
| `GET /api/jobs/{id}` | Poll job status and counters. |
| `GET /api/jobs/{id}/events` | SSE stream of live progress. Reconnect-safe. |
| `GET /api/jobs/{id}/screenshot/{step}` | PNG from the agent's view at that step. |
| `GET /api/jobs/{id}/spec` | The `feature_spec.json` produced by the analyzer. |
| `GET /api/jobs/{id}/download` | `.zip` of the generated MCP server. |

---

```
URL ──▶ explorer ──▶ trace.json ──▶ analyzer ──▶ feature_spec.json ──▶ generator ──▶ server.py
        (Claude +    (UI actions    (mechanical    (human-readable     (deterministic
         Playwright)  + network)     grouping +     feature list)       codegen)
                                     Claude)
```

## Pieces

| | What it does | LLM-driven? |
| --- | --- | --- |
| `explorer/agent.py` | Drives a browser, asks Claude what to click next, captures every network call | Yes — Claude vision picks each action |
| `analyzer/analyze.py` | Groups endpoints by `(method, host, path-template)`, then asks Claude to name and describe them | Hybrid — mechanical bucketing first, Claude semantics second |
| `generator/generate.py` | Templates a Python MCP server from the feature spec | No — pure codegen, no drift |
| `auth_capture.py` | Lets you log in by hand and dumps cookies the agent + server can reuse | No |
| `pipeline.py` | Runs all three end-to-end | — |

## Quick start

```bash
pip install playwright anthropic httpx mcp
playwright install chromium
export ANTHROPIC_API_KEY=sk-ant-...

# Public site, no login:
python pipeline.py https://news.ycombinator.com --out runs/hn

# Site that needs login:
python auth_capture.py https://app.example.com    # log in by hand, cookies saved
python pipeline.py https://app.example.com --out runs/example
```

The output `runs/example/mcp_server/` is a runnable MCP server you can register with Claude Desktop or any MCP-aware client.

## Why split it this way

The exploration step is unreliable by nature — sites change, agents miss things, login flows break. Keeping it as a separate stage that produces a versioned `trace.json` means you can re-analyze and re-generate without re-exploring. And keeping the generator deterministic means: once you've reviewed and edited a `feature_spec.json`, the generated server is exactly what you signed off on, not something an LLM re-imagined on the fly.

## Known limitations

- **App stores**: this only handles web apps. App store listings can be scraped for *advertised* features, but actually exercising a mobile app needs an emulator (Appium / Maestro) — separate problem.
- **Bot detection**: Cloudflare and friends will block you on many sites. Browserbase or playwright-stealth help; nothing makes it disappear.
- **Coverage**: expect 60–80% of common features on a first pass. Bumping `--max-steps` helps, as does running multiple times with different starting paths.
- **API stability**: the generated server calls the same endpoints the site uses internally. When the site ships a redesign, the server breaks. This is fundamental — re-run the pipeline.
- **Terms of service**: most sites' ToS forbid automated access and credential sharing. Fine for personal use against your own accounts; risky as a public product. Plan accordingly.
