import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";

const shots = "/opt/cursor/artifacts";
const photographerEmail = "photo.studio.pipeline@example.com";
const photographerPassword = "PhotoTest!9599";
const adminEmail = "admin.e2e@example.com";
const adminPassword = "AdminTest!9599";
const clientEmail = "test.studio.pipeline@example.com";
const clientPassword = "StudioTest!9599";
const listingId = "teststudio01";

async function shot(page: Page, name: string, width: number, fullPage = false) {
  await mkdir(shots, { recursive: true });
  await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
  await page.screenshot({
    path: `${shots}/after-studio-${width}-${name}.png`,
    fullPage,
    animations: "disabled",
    timeout: 15_000,
  });
}

async function signIn(page: Page, path: string, email: string, password: string) {
  await page.goto(path);
  await page.getByPlaceholder("Email address").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL((url) => {
    const pathName = url.pathname;
    if (pathName.includes("login")) return false;
    return pathName.startsWith("/admin") || pathName.startsWith("/portal");
  });
}

test.beforeEach(() => {
  const host = process.env.FIRESTORE_EMULATOR_HOST || "";
  test.skip(!host || host.includes("googleapis.com"), "Studio pipeline runs only against the Firebase emulators.");
  test.skip(test.info().project.name !== "desktop", "The pipeline is exercised once, then screenshotted at both widths.");
});

test("photographer upload reaches a delivered client gallery", async ({ page }) => {
  test.setTimeout(180_000);
  const photoNames = [
    "listing-living-01.jpg",
    "listing-living-02.jpg",
    "listing-living-03.jpg",
    "listing-living-04.jpg",
    "luxury-exterior.jpg",
    "luxury-interior.jpg",
    "forest-heights-twilight-front.jpg",
    "lifestyle-mtz04802.jpg",
  ];
  const uploads = await Promise.all(photoNames.map(async (name) => ({
    name,
    mimeType: "image/jpeg",
    buffer: await readFile(`public/media/photos/${name}`),
  })));

  await signIn(page, "/admin/login", photographerEmail, photographerPassword);
  await page.goto(`/admin/photographer?job=${listingId}`);
  await expect(page.getByTestId("shoot-uploader")).toBeVisible();
  await page.getByTestId("shoot-uploader").locator("input[type=file]").setInputFiles(uploads);
  await page.getByTestId("shoot-uploader").getByRole("button", { name: /Upload the shoot/ }).click();
  await expect(page.getByText(/file.*uploaded|Studio is editing/i).first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Sign Out" }).click();
  await page.waitForURL(/\/admin\/login/);
  await signIn(page, "/admin/login", adminEmail, adminPassword);
  await page.goto("/admin/studio");
  await expect(page.getByTestId("scratch-pad")).toBeVisible();
  await shot(page, "landing", 1440);
  await shot(page, "landing", 390);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId("studio-order-pick").selectOption(listingId);
  await expect(page.getByTestId("scratch-listing")).toContainText("221 Test Studio Lane");
  await expect(page.locator("[data-testid='studio-pipeline-status'] [data-current='true']")).toHaveText("Editing");
  await expect(page.getByText("listing-living-01.jpg").first()).toBeVisible();
  await expect(page.getByTestId("studio-ai-note")).toBeVisible();
  await expect(page.getByText(/· failed/i)).toHaveCount(0);
  await shot(page, "order-media", 1440);
  await shot(page, "order-media", 390);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId("scratch-select-all").click();
  await page.getByRole("button", { name: "Move listing-living-02.jpg earlier" }).click();
  await page.getByTestId("studio-export-gallery").click();
  await expect(page.locator("[data-testid='studio-pipeline-status'] [data-current='true']")).toHaveText("Ready for review", { timeout: 30_000 });
  await shot(page, "export", 1440);
  await shot(page, "export", 390);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId("studio-deliver").click({ timeout: 15_000 });
  await expect(page.locator("[data-testid='studio-pipeline-status'] [data-current='true']")).toHaveText("Delivered", { timeout: 30_000 });
  await expect(page.getByTestId("studio-open-gallery")).toBeVisible();
  await shot(page, "deliver", 1440);
  await shot(page, "deliver", 390);

  const galleryHref = await page.getByTestId("studio-open-gallery").getAttribute("href");
  expect(galleryHref).toBeTruthy();
  await page.goto(galleryHref!);
  await expect(page.getByRole("heading", { name: "221 Test Studio Lane" })).toBeVisible();
  await expect(page.getByTestId("gallery-order-number")).toContainText("#221");
  await expect(page.getByTestId("gallery-download-all")).toBeVisible();
  await expect(page.getByTestId("gallery-download-web")).toBeVisible();
  await expect(page.getByTestId("gallery-download-print")).toBeVisible();
  await page.getByTestId("gallery-share").click();
  await expect(page.getByRole("button", { name: "View full screen" })).toHaveCount(0);
  await page.getByTestId("gallery-hero").click();
  await expect(page.getByTestId("gallery-lightbox")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("gallery-lightbox-web")).toBeVisible();
  await page.getByTestId("gallery-lightbox-close").click();
  const orderSize = await page.getByTestId("gallery-order-number").evaluate((node) => getComputedStyle(node).fontSize);
  expect(parseFloat(orderSize)).toBeLessThan(24);
  await shot(page, "client-gallery", 1440, true);
  await shot(page, "client-gallery", 390, true);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/dashboard");
  await page.getByRole("button", { name: "Sign Out" }).click();
  await page.waitForURL(/\/admin\/login/);
  await signIn(page, "/portal", clientEmail, clientPassword);
  await page.goto(`/portal/listings/${listingId}`);
  await expect(page.getByText("221 Test Studio Lane").first()).toBeVisible();
  await expect(page.getByTestId("order-number").first()).toContainText("#221");
});
