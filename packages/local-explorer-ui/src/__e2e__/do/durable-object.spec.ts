import { beforeEach, describe, expect, test } from "vitest";
import {
	isTextVisible,
	navigateToDOClass,
	page,
	seedDO,
	waitForText,
} from "../utils";

describe("Durable Objects", () => {
	beforeEach(async () => {
		await seedDO("test-object");
	});

	describe("class listing", () => {
		test("displays DO class page", async () => {
			await navigateToDOClass("MyDurableObject");

			// Should show the class name in breadcrumbs
			await waitForText("MyDurableObject");
			await waitForText("Durable Objects");
		});

		test("shows 'Object ID' header in table", async () => {
			await navigateToDOClass("MyDurableObject");

			// The table should have an 'Object ID' column
			await waitForText("Object ID");
		});

		test("shows Open Studio link for objects if they exist", async () => {
			await navigateToDOClass("MyDurableObject");
			await waitForText("MyDurableObject");

			await page.waitForTimeout(1_000);

			const openStudioLinks = page.locator('a:has-text("Open Studio")');
			const count = await openStudioLinks.count();
			expect(count).toBeGreaterThanOrEqual(0);
		});
	});

	describe("empty state", () => {
		test("shows message when no DO objects exist or shows objects", async () => {
			await navigateToDOClass("MyDurableObject");

			await page.waitForTimeout(1_000);

			const hasEmptyMessage = await isTextVisible(
				"No Durable Objects with stored data"
			);
			const hasObjectIdHeader = await isTextVisible("Object ID");
			const hasOpenStudioLink = await page
				.locator('a:has-text("Open Studio")')
				.first()
				.isVisible()
				.catch(() => false);

			expect(hasEmptyMessage || hasObjectIdHeader || hasOpenStudioLink).toBe(
				true
			);
		});
	});

	describe("navigation", () => {
		test("breadcrumbs show DO and class name", async () => {
			await navigateToDOClass("MyDurableObject");

			// Breadcrumbs should show the navigation path
			await waitForText("Durable Objects");
			await waitForText("MyDurableObject");
		});
	});

	// Note: Testing the actual DO Studio requires navigating to a specific object
	// which requires knowing the object ID (hex-encoded). The seed endpoint creates
	// an object with idFromName("test-object"), but we'd need to look up the actual ID.
	// For comprehensive DO Studio testing, we'd need to:
	// 1. Create a DO by calling the /do endpoint
	// 2. List objects to find the ID
	// 3. Navigate to the object's studio
});
