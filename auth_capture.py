"""
Auth capture helper.

For sites that require login, the safest pattern is: don't hand the agent
your password. Instead, run this script — it opens a real browser, you log
in like a human (handle 2FA, CAPTCHA, whatever), and when you're done it
dumps the resulting cookies to cookies.json.

The generated MCP server then uses those cookies to make authenticated
requests on your behalf.

Usage:
    python auth_capture.py https://app.example.com
    # browser opens, you log in
    # press ENTER in this terminal when you're logged in
    # cookies.json is written
"""

import asyncio
import json
import sys
from pathlib import Path

from playwright.async_api import async_playwright


async def capture(url: str, out: str = "cookies.json") -> None:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()
        await page.goto(url)

        print("\n" + "=" * 60)
        print(f"Browser is open. Log into {url} as you normally would.")
        print("When you are fully logged in, press ENTER here to dump cookies.")
        print("=" * 60 + "\n")
        await asyncio.get_event_loop().run_in_executor(None, input)

        cookies = await context.cookies()
        # httpx wants a flat dict
        flat = {c["name"]: c["value"] for c in cookies}
        Path(out).write_text(json.dumps(flat, indent=2))
        print(f"Wrote {len(flat)} cookies to {out}")

        await context.close()
        await browser.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python auth_capture.py <url> [out=cookies.json]")
        sys.exit(1)
    out = sys.argv[2] if len(sys.argv) > 2 else "cookies.json"
    asyncio.run(capture(sys.argv[1], out))
