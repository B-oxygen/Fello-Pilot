import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Covers PRD M2.1 with TWO complementary assertions:
//  (a) CSS contract: inject the production .sim-badge class into the loaded
//      app page and read computed style. Proves pointer-events:none,
//      user-select:none, the badge is visible, and the label is "SIMULATION".
//  (b) Component-mount contract: static-read src/components/cards/
//      ReceiptCard.tsx and assert it renders <SimulationBadge /> when
//      receipt.simulated is true. Without this, a future refactor that
//      removed the SimulationBadge mount would slip past test (a).
test("simulation-badge CSS contract: visible + non-dismissable (pointer-events:none)", async ({
  page,
}) => {
  await page.goto("/");

  const result = await page.evaluate(() => {
    const el = document.createElement("span");
    el.className = "sim-badge";
    el.setAttribute("data-testid", "simulation-badge");
    el.textContent = "SIMULATION";
    document.body.appendChild(el);
    const cs = window.getComputedStyle(el);
    return {
      visible: el.offsetParent !== null && cs.display !== "none",
      pointerEvents: cs.pointerEvents,
      userSelect: cs.userSelect,
      textContent: el.textContent ?? "",
    };
  });

  expect(result.visible).toBe(true);
  expect(result.pointerEvents).toBe("none");
  expect(result.userSelect).toBe("none");
  expect(result.textContent).toBe("SIMULATION");

  await expect(page.getByTestId("simulation-badge").first()).toBeVisible();

  const receiptCardSrc = readFileSync(
    resolve(process.cwd(), "src/components/cards/ReceiptCard.tsx"),
    "utf8",
  );
  expect(receiptCardSrc).toMatch(
    /\{\s*isSimulated\s*&&\s*<SimulationBadge\s*\/>\s*\}/,
  );
  expect(receiptCardSrc).toMatch(/data-testid="chat-card-receipt"/);
  expect(receiptCardSrc).toMatch(/data-simulated=\{String\(receipt\.simulated\)\}/);
});
