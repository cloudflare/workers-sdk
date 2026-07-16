import { afterEach, describe, test } from "vitest";
import { page, viteUrl } from "./utils";

const WORKERS_ROUTE = "**/cdn-cgi/explorer/api/local/workers";

function createWorkers(count: number) {
	return Array.from({ length: count }, (_, index) => ({
		isSelf: index === 0,
		name: `worker-${index + 1}`,
	}));
}

async function loadWorkers(count: number): Promise<void> {
	await page.route(WORKERS_ROUTE, async (route) => {
		await route.fulfill({
			contentType: "application/json",
			body: JSON.stringify({
				errors: [],
				messages: [],
				result: createWorkers(count),
				success: true,
			}),
		});
	});

	await page.goto(viteUrl);
}

function waitForWorkersResponse() {
	return page.waitForResponse((response) =>
		response.url().endsWith("/cdn-cgi/explorer/api/local/workers")
	);
}

afterEach(async () => {
	await page.unroute(WORKERS_ROUTE);
});

describe("worker selector", () => {
	test("stays hidden when there is only one worker", async ({ expect }) => {
		await loadWorkers(1);

		expect(await page.getByRole("combobox").count()).toBe(0);
	});

	test("keeps nine workers fully visible", async ({ expect }) => {
		await loadWorkers(9);

		await page.getByRole("combobox").click();
		const listBounds = await page.getByRole("listbox").boundingBox();
		const lastOptionBounds = await page
			.getByRole("option", { name: "worker-9" })
			.boundingBox();

		expect(listBounds).not.toBeNull();
		expect(lastOptionBounds).not.toBeNull();
		if (listBounds && lastOptionBounds) {
			expect(lastOptionBounds.y + lastOptionBounds.height).toBeLessThanOrEqual(
				listBounds.y + listBounds.height
			);
		}
	});

	test("scrolls to and selects workers beyond the visible limit", async ({
		expect,
	}) => {
		await page.setViewportSize({ height: 720, width: 1280 });
		await loadWorkers(12);

		await page.getByRole("combobox").click();
		const list = page.getByRole("listbox");

		const dimensions = await list.evaluate((element) => ({
			clientHeight: element.clientHeight,
			scrollHeight: element.scrollHeight,
		}));
		expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);

		const main = page.locator("main");
		const pageScrollTop = await main.evaluate((element) => element.scrollTop);
		await list.hover();
		await page.mouse.wheel(0, dimensions.scrollHeight);
		await expect
			.poll(async () => await list.evaluate((element) => element.scrollTop))
			.toBeGreaterThan(0);
		expect(await main.evaluate((element) => element.scrollTop)).toBe(
			pageScrollTop
		);

		const workersResponse = waitForWorkersResponse();
		await page.getByRole("option", { name: "worker-12" }).click();
		await workersResponse;
		await expect
			.poll(() => new URL(page.url()).searchParams.get("worker"))
			.toBe("worker-12");
		await page.getByRole("combobox").getByText("worker-12").waitFor();
		await page.waitForLoadState("networkidle");
	});

	test("reaches later workers with the keyboard in a narrow viewport", async ({
		expect,
	}) => {
		await loadWorkers(12);
		await page.setViewportSize({ height: 640, width: 800 });

		await page.getByRole("combobox").click({ timeout: 5_000 });
		const list = page.getByRole("listbox");
		const lastOption = page.getByRole("option", { name: "worker-12" });
		let reachedLastOption = false;
		for (let index = 0; index < 12; index++) {
			await page.keyboard.press("ArrowDown");
			reachedLastOption =
				(await lastOption.getAttribute("data-highlighted")) !== null;
			if (reachedLastOption) {
				break;
			}
		}
		expect(reachedLastOption).toBe(true);
		expect(await list.evaluate((element) => element.scrollTop)).toBeGreaterThan(
			0
		);
		const workersResponse = waitForWorkersResponse();
		await page.keyboard.press("Enter");
		await workersResponse;

		await expect
			.poll(() => new URL(page.url()).searchParams.get("worker"))
			.toBe("worker-12");
		await page.getByRole("combobox").getByText("worker-12").waitFor();
		await page.waitForLoadState("networkidle");
	});
});
