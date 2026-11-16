import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const clientEmail = "ada.lane@example.com";
const clientPassword = "PortalTest!9599";
const adminEmail = "admin.e2e@example.com";
const adminPassword = "AdminTest!9599";
const shots = "/opt/cursor/artifacts";

async function shot(page: Page, name: string) {
  await mkdir(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/portal-${test.info().project.name}-${name}.png`, fullPage: true });
}

async function signIn(page: Page, path: string, email: string, password: string) {
  await page.goto(path);
  await page.getByPlaceholder("Email address").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(path.includes("/admin") ? /\/admin\/(dashboard|orders)/ : /\/portal\/home/);
}

async function openNav(page: Page, name: string) {
  const target = page.getByRole("link", { name, exact: true }).or(page.getByRole("button", { name, exact: true })).first();
  if (!(await target.isVisible())) {
    await page.getByRole("button", { name: "Menu", exact: true }).click();
  }
  await target.click();
}

test.beforeEach(() => {
  const host = process.env.FIRESTORE_EMULATOR_HOST || "";
  test.skip(!host || host.includes("googleapis.com"), "Portal sync runs only against the Firebase emulators.");
});

test("portal navigation stays on real routes", async ({ page }) => {
  await signIn(page, "/portal", clientEmail, clientPassword);
  await expect(page).toHaveURL(/\/portal\/home/);
  await expect(page.getByTestId("order-number").first()).toContainText("#014");
  await expect(page.getByText("14 Ember Lane").first()).toBeVisible();
  await shot(page, "client-home");

  for (const label of ["Schedule", "Messages", "Profile", "Team", "Clients", "Billing", "Files", "Place Order"]) {
    await openNav(page, label);
    await expect(page.getByText("Page not found")).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/404/);
  }
  await expect(page.getByRole("heading", { name: "Place an order" })).toBeVisible();
  await shot(page, "client-order");
});

test("admin changes show for the client, and client changes show for admin", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "The full sync is exercised once on desktop.");
  test.setTimeout(120_000);

  await signIn(page, "/portal", clientEmail, clientPassword);
  await page.goto("/portal/settings/profile");
  await page.getByRole("textbox", { name: "Phone" }).fill("7135550199");
  await page.getByRole("textbox", { name: "Brokerage", exact: true }).fill("Ember Brokerage");
  await page.getByLabel("Text updates").check();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Phone" })).toHaveValue("(713) 555-0199");
  await expect(page.getByRole("textbox", { name: "Brokerage", exact: true })).toHaveValue("Ember Brokerage");
  await expect(page.getByLabel("Text updates")).toBeChecked();

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.locator('input[aria-label="Headshot"]').setInputFiles({ name: "ada.png", mimeType: "image/png", buffer: png });
  await expect(page.getByText("Headshot saved")).toBeVisible();

  await page.goto("/portal/settings/files");
  await page.getByLabel("Upload a shared file").setInputFiles({
    name: "client-note.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello from ada"),
  });
  await expect(page.getByText("client-note.txt")).toBeVisible();
  await shot(page, "client-files");

  await page.getByRole("button", { name: "Sign out" }).click();
  await signIn(page, "/admin/login", adminEmail, adminPassword);
  await page.goto("/admin/customers/crm-e2e-ada");
  await expect(page.getByText("(713) 555-0199")).toBeVisible();
  await expect(page.getByText("Ember Brokerage")).toBeVisible();
  await expect(page.getByTestId("admin-client-headshot").locator("img")).toBeVisible();
  await page.getByRole("button", { name: "Order history" }).click();
  await expect(page.getByTestId("order-number").first()).toContainText("#014");
  await page.getByRole("button", { name: "Files" }).click();
  await expect(page.getByText("client-note.txt")).toBeVisible();
  await page.getByLabel("Upload a shared file").setInputFiles({
    name: "floor-plan.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.1 iconic"),
  });
  await expect(page.getByText("floor-plan.pdf")).toBeVisible();
  await expect(page.getByText("From client")).toBeVisible();
  await shot(page, "admin-client");

  await page.goto("/admin/orders");
  await expect(page.getByText("#014").first()).toBeVisible();
  await shot(page, "admin-orders");

  await page.goto("/admin/listing/listing-e2e");
  await expect(page.getByTestId("order-number").first()).toContainText("#014");
  await page.getByTitle("Unlock status").click();
  await page.locator("select").first().selectOption("delivered");
  await expect(page.locator("select").first()).toHaveValue("delivered");
  await shot(page, "admin-listing");

  await page.goto("/admin/order-request/order-e2e");
  await expect(page.getByTestId("order-number").first()).toContainText("#014");
  await page.getByRole("button", { name: "Back to Orders" }).click();
  await expect(page).toHaveURL(/\/admin\/orders/);
  await page.getByRole("button", { name: "Sign Out" }).click();
  await page.waitForURL(/\/admin\/login/);

  await signIn(page, "/portal", clientEmail, clientPassword);
  await page.goto("/portal/listings/listing-e2e");
  await expect(page.getByTestId("order-number").first()).toContainText("#014");
  await expect(page.getByText(/delivered/i).first()).toBeVisible();
  await page.goto("/portal/settings/files");
  await expect(page.getByTestId("shared-file").filter({ hasText: "floor-plan.pdf" })).toContainText("From Iconic");
  await shot(page, "client-after-admin");
});

test("mobile screenshots of the synced client and admin", async ({ page }) => {
  test.skip(test.info().project.name !== "mobile", "Desktop already captured the wide layout.");
  await signIn(page, "/portal", clientEmail, clientPassword);
  await page.goto("/portal/listings/listing-e2e");
  await expect(page.getByText(/delivered/i).first()).toBeVisible();
  await shot(page, "client-listing");
  await page.goto("/portal/settings/files");
  await expect(page.getByText("floor-plan.pdf")).toBeVisible();
  await shot(page, "client-files");
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await signIn(page, "/admin/login", adminEmail, adminPassword);
  await page.goto("/admin/customers/crm-e2e-ada");
  await page.getByRole("button", { name: "Files" }).click();
  await expect(page.getByText("floor-plan.pdf")).toBeVisible();
  await expect(page.getByText("(713) 555-0199")).toBeVisible();
  await shot(page, "admin-client");
});
