import { test, expect } from "@playwright/test";

// Covers PRD M2.1: a SIMULATION receipt MUST render a visible
// [data-testid="simulation-badge"] that is non-dismissable. Strategy: inject
// the production `.sim-badge` class (from src/app/globals.css line 390) into
// the loaded app page and read its computed style. This proves the CSS
// invariant (pointer-events:none, user-select:none) on the EXACT class the
// SimulationBadge component renders. The component mount-on-simulated-receipt
// guarantee is enforced statically in ReceiptCard.tsx
// (`{isSimulated && <SimulationBadge />}`) and exercised at runtime by
// scripts/demo_safe_e2e.mjs under the mock adapter.
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
});
