import { test, expect } from "@playwright/test";
const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD;
test("purchase order receives 40 then 60", async ({ page }) => {
  await page
    .getByRole("link", { name: "Purchase orders", exact: true })
    .click();
  await page.getByRole("button", { name: "Create purchase order" }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Supplier", { exact: true })
    .selectOption({ label: "ABC Electronics" });
  await dialog
    .getByLabel("Product", { exact: true })
    .selectOption({ label: "USB-C-001 / USB-C Cable - 1 metre" });
  await dialog.getByLabel("Quantity", { exact: true }).fill("100");
  await dialog.getByLabel("Unit price", { exact: true }).fill("250.25");
  const orderCreated = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/purchase-orders/") &&
      response.request().method() === "POST" &&
      response.status() === 201,
  );
  await dialog.getByRole("button", { name: "Save draft", exact: true }).click();
  const number: string = (await (await orderCreated).json()).po_number;
  await expect(dialog).not.toBeVisible();
  const orderRow = page
    .locator("table")
    .first()
    .getByRole("row")
    .filter({ hasText: number });
  await expect(orderRow).toContainText("25025.00");
  await orderRow.getByRole("button", { name: "Submit", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  for (const quantity of [40, 60]) {
    await page
      .locator("table")
      .first()
      .getByRole("row")
      .filter({ hasText: number })
      .getByRole("button", { name: "Receive goods", exact: true })
      .click();
    dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Receiving location", { exact: true })
      .selectOption({ label: "Kathmandu / MAIN" });
    await dialog.getByRole("spinbutton").fill(String(quantity));
    const receiptCreated = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/goods-receipts/") &&
        response.request().method() === "POST" &&
        response.status() === 201,
    );
    await dialog.getByRole("button", { name: "Save receipt draft" }).click();
    const receiptNumber: string = (await (await receiptCreated).json())
      .receipt_number;
    await expect(dialog).not.toBeVisible();
    await page
      .locator("table")
      .nth(1)
      .getByRole("row")
      .filter({ hasText: receiptNumber })
      .getByRole("button", { name: "Review & post" })
      .click();
    await expect(page.getByRole("dialog")).toContainText(`${quantity} units`);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }
  const finalRow = page
    .locator("table")
    .first()
    .getByRole("row")
    .filter({ hasText: number });
  await expect(finalRow).toContainText("100/100 received");
  await expect(finalRow).toContainText("RECEIVED");
});
test.beforeEach(async ({ page }) => {
  if (!username || !password)
    throw new Error(
      "Set E2E_USERNAME and E2E_PASSWORD for a disposable demo administrator.",
    );
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
});
test("receipt and issue flow uses live ledger and remains responsive", async ({
  page,
}) => {
  const sku = `E2E-${Date.now()}`;
  await page.getByRole("link", { name: "Products", exact: true }).click();
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("sku", { exact: true }).fill(sku);
  await dialog.getByLabel("name", { exact: true }).fill("Browser test cable");
  await dialog
    .getByLabel("unit", { exact: true })
    .selectOption({ label: "Pieces" });
  await dialog.getByLabel("reorder level", { exact: true }).fill("5");
  await dialog
    .getByLabel("default purchase price", { exact: true })
    .fill("250.00");
  await dialog
    .getByRole("button", { name: "Save product", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("link", { name: "Stock operations", exact: true })
    .click();
  async function operation(type: string, quantity: number, reason: string) {
    await page
      .getByRole("button", { name: "New operation", exact: true })
      .click();
    const modal = page.getByRole("dialog");
    await modal.getByLabel("Operation", { exact: true }).selectOption(type);
    await modal
      .getByLabel(type === "RECEIVE" ? "To location" : "From location", {
        exact: true,
      })
      .selectOption({ label: "Kathmandu / MAIN" });
    await modal
      .getByLabel("Product", { exact: true })
      .selectOption({ label: `${sku} / Browser test cable` });
    await modal.getByLabel("Quantity", { exact: true }).fill(String(quantity));
    await modal.getByLabel("Reason", { exact: true }).fill(reason);
    await modal
      .getByRole("button", { name: "Save draft", exact: true })
      .click();
    await expect(modal).not.toBeVisible();
    await page
      .getByRole("row")
      .filter({ hasText: reason })
      .getByRole("button", { name: "Review & post" })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm posting" })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: reason }),
    ).toContainText("POSTED");
  }
  await operation("RECEIVE", 20, `Opening ${sku}`);
  await operation("ISSUE", 4, `Issue ${sku}`);
  await page.getByRole("link", { name: "Stock on hand", exact: true }).click();
  await page.getByLabel("Search inventory").fill(sku);
  await expect(page.getByRole("row").filter({ hasText: sku })).toContainText(
    "16",
  );
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
});
