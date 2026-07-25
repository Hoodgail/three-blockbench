"""Capture the example and guide at a narrow mobile viewport."""

import json
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "artifacts"
URL = "http://127.0.0.1:4173"


def main() -> None:
    errors: list[str] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
        page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
        page.on("pageerror", lambda error: errors.append(str(error)))

        page.goto(URL, wait_until="networkidle")
        page.wait_for_function("window.__THREE_BLOCKBENCH__?.ready === true", timeout=30_000)
        page.screenshot(path=str(ARTIFACTS / "desert-dog-mobile.png"), full_page=True)
        clip_count = page.locator(".clip-button").count()

        page.goto(f"{URL}/docs.html", wait_until="networkidle")
        page.screenshot(path=str(ARTIFACTS / "loader-guide-mobile.png"), full_page=True)
        layout = page.evaluate("""({
            viewport: document.documentElement.clientWidth,
            scroll: document.documentElement.scrollWidth,
            main: document.querySelector('main').getBoundingClientRect().width,
            header: document.querySelector('header').getBoundingClientRect().width
        })""")
        horizontal_overflow = layout["scroll"] > layout["viewport"]
        browser.close()

    print(json.dumps({
        "clip_buttons": clip_count,
        "docs_horizontal_overflow": horizontal_overflow,
        "docs_layout": layout,
        "errors": errors,
    }, indent=2))


if __name__ == "__main__":
    main()
