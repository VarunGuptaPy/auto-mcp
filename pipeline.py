"""
End-to-end pipeline: URL -> exploration trace -> feature spec -> MCP server.

Usage:
    python pipeline.py https://example.com --out runs/example
    python pipeline.py https://app.foo.com --email me@x.com --password ... --out runs/foo
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from explorer.agent import explore
from analyzer.analyze import analyze
from generator.generate import generate


async def run(url: str, out: str, creds: dict | None, max_steps: int, headed: bool) -> None:
    out_dir = Path(out)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[1/3] Exploring {url}")
    await explore(
        url=url,
        creds=creds,
        max_steps=max_steps,
        headless=not headed,
        out_dir=out_dir / "trace",
    )

    print(f"[2/3] Analyzing trace")
    spec = analyze(out_dir / "trace" / "trace.json", out_dir / "feature_spec.json")
    print(f"     -> {len(spec.get('features', []))} features")

    print(f"[3/3] Generating MCP server")
    generate(spec, out_dir / "mcp_server")
    print(f"\nDone. MCP server in: {out_dir / 'mcp_server'}/")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--email")
    parser.add_argument("--password")
    parser.add_argument("--out", default="run_output")
    parser.add_argument("--max-steps", type=int, default=30)
    parser.add_argument("--headed", action="store_true")
    args = parser.parse_args()

    creds = None
    if args.email and args.password:
        creds = {"email": args.email, "password": args.password}

    asyncio.run(run(args.url, args.out, creds, args.max_steps, args.headed))
