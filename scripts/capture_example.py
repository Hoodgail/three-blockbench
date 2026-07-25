"""Visual smoke test and deterministic capture for the live example."""

import json
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "artifacts"
FRAMES = ARTIFACTS / "frames"
URL = "http://127.0.0.1:4173"


def main() -> None:
    console_errors: list[str] = []
    page_errors: list[str] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(
            viewport={"width": 1440, "height": 1000},
            device_scale_factor=1,
            reduced_motion="no-preference",
        )
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.goto(URL, wait_until="networkidle")
        page.wait_for_function("window.__THREE_BLOCKBENCH__?.ready === true", timeout=30_000)
        page.wait_for_timeout(700)

        page.screenshot(path=str(ARTIFACTS / "desert-dog-idle.png"), full_page=True)
        page.locator('[data-animation="animation.walk_forward"]').click()
        page.wait_for_timeout(650)
        page.screenshot(path=str(ARTIFACTS / "desert-dog-walk.png"), full_page=True)
        page.get_by_role("button", name="Rig", exact=True).click()
        page.wait_for_timeout(100)
        page.locator("#viewport").screenshot(path=str(ARTIFACTS / "desert-dog-rig.png"))
        page.get_by_role("button", name="Rig", exact=True).click()

        stats = {
            "meshes": page.locator("#mesh-count").inner_text(),
            "bones": page.locator("#bone-count").inner_text(),
            "clips": page.locator("#clip-count").inner_text(),
            "clip_buttons": page.locator(".clip-button").count(),
            "canvas": page.locator("#model-canvas").bounding_box(),
        }

        capture_clips = page.locator(".clip-button").evaluate_all(
            """buttons => buttons.map(button => ({
                name: button.dataset.animation,
                duration: Number(button.querySelector('small').textContent.replace('s', ''))
            }))"""
        )
        frame_index = 0
        page.get_by_role("button", name="Pause animation").click()
        for clip in capture_clips:
            clip_name = clip["name"]
            duration = clip["duration"]
            frame_count = 4
            page.evaluate("name => window.__THREE_BLOCKBENCH__.setAnimation(name)", clip_name)
            page.wait_for_timeout(220)
            page.get_by_role("button", name="Pause animation").click()
            for step in range(frame_count):
                time = duration * step / frame_count
                page.evaluate("time => window.__THREE_BLOCKBENCH__.setTime(time)", time)
                page.wait_for_timeout(20)
                page.screenshot(path=str(FRAMES / f"frame_{frame_index:03d}.png"), full_page=False)
                frame_index += 1

        page.goto(f"{URL}/docs.html", wait_until="networkidle")
        page.screenshot(path=str(ARTIFACTS / "loader-guide.png"), full_page=True)
        stats["docs_sections"] = page.locator("main section").count()
        stats["docs_heading"] = page.locator("h1").inner_text()

        browser.close()

    print(json.dumps({
        "stats": stats,
        "frames": frame_index,
        "console_errors": console_errors,
        "page_errors": page_errors,
    }, indent=2))


if __name__ == "__main__":
    main()
