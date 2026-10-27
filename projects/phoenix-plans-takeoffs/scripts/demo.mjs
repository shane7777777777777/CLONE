import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.PHOENIX_URL ?? "http://127.0.0.1:4173";
const out = new URL("../handoff/screenshots/", import.meta.url);

await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await context.newPage();
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));

try {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByTestId("library").waitFor();
  await page.screenshot({ path: new URL("01-library.png", out).pathname, fullPage: true });

  await page.getByTestId("load-sample").click();
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    const status = document.querySelector("[data-testid=status]")?.textContent;
    return Boolean(canvas && canvas.width > 400 && status === "Saved");
  });
  await page.screenshot({ path: new URL("02-sample-sheet.png", out).pathname });

  const overlay = page.getByTestId("overlay");
  const box = await overlay.boundingBox();
  if (!box) throw new Error("The drawing surface has no box.");
  await page.getByTestId("tool-ink").click();
  await page.mouse.move(box.x + 120, box.y + 140);
  await page.mouse.down();
  await page.mouse.move(box.x + 220, box.y + 180);
  await page.mouse.move(box.x + 260, box.y + 120);
  await page.mouse.up();
  await page.locator("svg path").first().waitFor();

  await page.evaluate(() => {
    const session = window.__phoenix?.session;
    if (!session) throw new Error("Debug session is missing.");
    session.calibrate({ x: 72, y: 360 }, { x: 432, y: 360 }, 30, "ft");
    session.addDistance({ x: 72, y: 220 }, { x: 192, y: 220 });
    session.setTaskView("today");
  });
  await page.getByText("10 ft").waitFor();
  await page.getByText("Calibrated on this page only").waitFor();
  await page.getByTestId("task-title").fill("Walk the synthetic yard");
  await page.getByTestId("task-due").fill(new Date().toISOString().slice(0, 10));
  await page.getByTestId("task-add").click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("[data-testid=task-name]")].some((input) => input instanceof HTMLInputElement && input.value === "Walk the synthetic yard"),
  );
  await page.getByTestId("status").filter({ hasText: /^Saved$/ }).waitFor({ timeout: 8000 });
  await page.screenshot({ path: new URL("03-markup-takeoff-tasks.png", out).pathname });

  await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId("open-project").click();
  await page.getByText("Synthetic note").waitFor();
  await page.getByText("10 ft").waitFor();
  await page.screenshot({ path: new URL("04-reopened.png", out).pathname });

  await page.getByTestId("add-revision").setInputFiles(new URL("../fixtures/mixed-pages.pdf", import.meta.url).pathname);
  await page.getByText("Page 1 of 4").waitFor();
  await page.getByTestId("revision-select").selectOption({ label: "Rev A" });
  await page.getByText("10 ft").waitFor();
  await page.screenshot({ path: new URL("05-revision-kept.png", out).pathname });

  const other = await context.newPage();
  await other.goto(base, { waitUntil: "networkidle" });
  await other.getByTestId("open-project").click();
  await other.getByTestId("editor").waitFor();
  await page.evaluate(() => window.__phoenix?.session.addText({ x: 80, y: 680 }, "Editor A"));
  await page.getByTestId("save").click();
  await page.getByTestId("status").filter({ hasText: /^Saved$/ }).waitFor();
  await other.evaluate(() => window.__phoenix?.session.addText({ x: 90, y: 660 }, "Editor B"));
  await other.getByTestId("save").click();
  await other.getByTestId("conflict-banner").waitFor();
  await other.screenshot({ path: new URL("06-conflict.png", out).pathname });
  await other.close();

  if (failures.length) throw new Error(failures.join("\n"));
  console.log("demo-ok");
} finally {
  await browser.close();
}
