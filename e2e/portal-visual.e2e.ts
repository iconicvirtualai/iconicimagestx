import { expect, test, type Page } from "@playwright/test";

const clientEmail = "ada.lane@example.com";
const clientPassword = "PortalTest!9599";
const adminEmail = "admin.e2e@example.com";
const adminPassword = "AdminTest!9599";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test.beforeEach(() => {
  const host = process.env.FIRESTORE_EMULATOR_HOST || "";
  test.skip(!host || host.includes("googleapis.com"), "Portal visual checks run only against the Firebase emulators.");
});

async function signIn(page: Page, path: string, email: string, password: string) {
  await page.goto(path);
  await page.getByPlaceholder("Email address").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(path.includes("/admin") ? /\/admin\/(dashboard|orders)/ : /\/portal\/home/);
}

async function contrast(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true }).first();
  await expect(button).toBeVisible();
  const colors = await button.evaluate((el) => {
    const style = getComputedStyle(el);
    return { color: style.color, background: style.backgroundColor };
  });
  expect(colors.color, `${name} label`).toBe("rgb(255, 255, 255)");
  const background = colors.background.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  expect(background, `${name} background`).toBeTruthy();
  const [red, green, blue] = background!.slice(1).map(Number);
  expect(red + green + blue, `${name} should sit on a dark or colored fill`).toBeLessThan(520);
}

test("primary portal buttons use white text", async ({ page }) => {
  await signIn(page, "/portal", clientEmail, clientPassword);
  await page.goto("/portal/settings/profile");
  await contrast(page, "Save profile");
  await page.goto("/portal/settings/team");
  await contrast(page, "Save team");
  await contrast(page, "Add teammate");
  await page.goto("/portal/settings/clients");
  await contrast(page, "Save client");
  await page.goto("/portal/settings/billing");
  await contrast(page, "Save billing");
  await page.goto("/portal/settings/files");
  const upload = page.locator("label.portal-primary", { hasText: "Upload file" });
  await expect(upload).toBeVisible();
  const uploadColor = await upload.evaluate((el) => getComputedStyle(el).color);
  expect(uploadColor).toBe("rgb(255, 255, 255)");
  await page.goto("/portal/order");
  await contrast(page, "Next Stage");
});

test("uploaded headshot replaces the logo on every avatar, and survives reload", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, "/portal", clientEmail, clientPassword);
  const profileReady = page.waitForResponse((res) => res.url().includes("/api/clients/me/hub/profile") && res.ok());
  await page.goto("/portal/settings/profile");
  await profileReady;
  await expect(page.getByTestId("portal-avatar")).toBeVisible();

  await page.locator('input[aria-label="Company logo"]').setInputFiles({
    name: "lane-logo.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(page.getByText("Company logo saved")).toBeVisible();
  await page.reload();
  const logo = page.getByTestId("profile-image-company-logo").locator("img");
  await expect(logo).toBeVisible();
  await expect.poll(async () => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

  await page.locator('input[aria-label="Headshot"]').setInputFiles({
    name: "ada.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(page.getByText("Headshot saved")).toBeVisible();
  const avatar = page.getByTestId("portal-avatar");
  await expect(avatar).toHaveAttribute("data-avatar-kind", "headshot");
  const src = await avatar.locator("img").getAttribute("src");
  expect(src).toBeTruthy();
  expect(src).not.toMatch(/X-Goog-|GoogleAccessId|Expires=/);
  await page.reload();
  await expect(page.getByTestId("portal-avatar")).toHaveAttribute("data-avatar-kind", "headshot");
  const reloaded = page.getByTestId("portal-avatar").locator("img");
  await expect(reloaded).toBeVisible();
  await expect.poll(async () => reloaded.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const durable = await reloaded.getAttribute("src");
  expect(durable).toBe(src);

  await expect(page.getByTestId("profile-image-headshot").locator("img")).toHaveAttribute("src", durable || "");
  if (test.info().project.name === "desktop") {
    await expect(page.getByTestId("portal-sidebar-avatar")).toHaveAttribute("data-avatar-kind", "headshot");
  }

  await page.goto("/portal/home?section=messages");
  await expect(page.getByTestId("portal-avatar")).toHaveAttribute("data-avatar-kind", "headshot");
  await expect(page.getByTestId("portal-message-avatar")).toHaveAttribute("data-avatar-kind", "headshot");
  await expect(page.getByTestId("portal-message-avatar").locator("img")).toHaveAttribute("src", durable || "");

  await page.goto("/portal/home?section=orders");
  await expect(page.getByTestId("order-number").first()).toContainText("#014");
  const orderSize = await page.getByTestId("order-number").first().locator("strong").evaluate((el) => {
    const style = getComputedStyle(el);
    return { size: style.fontSize, weight: style.fontWeight };
  });
  expect(orderSize.size).toBe("28px");
  expect(Number(orderSize.weight)).toBeGreaterThanOrEqual(900);

  if (test.info().project.name !== "desktop") return;
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menu").getByRole("button", { name: "Sign out" }).click();
  await signIn(page, "/admin/login", adminEmail, adminPassword);
  await page.goto("/admin/customers/crm-e2e-ada");
  const adminPhoto = page.getByTestId("admin-client-headshot").locator("img");
  await expect(adminPhoto).toBeVisible();
  await expect(adminPhoto).toHaveAttribute("data-avatar-kind", "headshot");
  await expect.poll(async () => adminPhoto.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
});
