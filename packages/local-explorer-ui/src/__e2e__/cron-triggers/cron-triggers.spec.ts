import { afterEach, describe, test } from "vitest";
import { page, viteUrl } from "../utils";

const WORKERS_ROUTE = "**/cdn-cgi/local/explorer/api/local/workers";
const SCHEDULED_ROUTE =
	"**/cdn-cgi/local/explorer/api/local/scheduled?worker=*";
const STORAGE_PREFIX = "local-explorer.cron-triggers.custom-rows.v1";

async function mockWorkers(crons: string[]): Promise<void> {
	await page.route(WORKERS_ROUTE, async (route) => {
		await route.fulfill({
			body: JSON.stringify({
				errors: [],
				messages: [],
				result: [
					{
						isSelf: true,
						name: "cron-worker",
						persistenceScope: "cron-e2e-project",
						triggers: { crons },
					},
				],
				success: true,
			}),
			contentType: "application/json",
		});
	});
}

async function openCronTriggers(): Promise<void> {
	await page.goto(
		new URL(
			"/cdn-cgi/local/explorer/cron-triggers?worker=cron-worker",
			viteUrl
		).toString()
	);
}

afterEach(async () => {
	await page.setViewportSize({ height: 720, width: 1280 });
	await page.evaluate((prefix) => {
		for (let index = localStorage.length - 1; index >= 0; index--) {
			const key = localStorage.key(index);
			if (key?.startsWith(prefix)) {
				localStorage.removeItem(key);
			}
		}
	}, STORAGE_PREFIX);
	await page.unroute(WORKERS_ROUTE);
	await page.unroute(SCHEDULED_ROUTE);
});

describe("Cron Triggers", () => {
	test("shows the authoritative empty state without test controls", async ({
		expect,
	}) => {
		await mockWorkers([]);
		await openCronTriggers();
		await page
			.getByRole("heading", { name: "No Cron Triggers configured" })
			.waitFor();
		expect(await page.getByRole("button", { name: "Add custom" }).count()).toBe(
			0
		);
		expect(
			await page.getByRole("button", { name: "Trigger", exact: true }).count()
		).toBe(0);
	});

	test("uses full-width equal panes and flattens only wide rows", async ({
		expect,
	}) => {
		await page.setViewportSize({ height: 900, width: 1920 });
		await mockWorkers(["0 17 * * sun"]);
		await openCronTriggers();
		const configuredPane = page.getByRole("region", {
			name: "Configured crons",
		});
		const customPane = page.getByRole("region", { name: "Custom crons" });
		const [configuredBox, customBox] = await Promise.all([
			configuredPane.boundingBox(),
			customPane.boundingBox(),
		]);
		expect(
			Math.abs((configuredBox?.width ?? 0) - (customBox?.width ?? 0))
		).toBeLessThanOrEqual(1);
		expect(
			Math.abs(
				(customBox?.x ?? 0) -
					((configuredBox?.x ?? 0) + (configuredBox?.width ?? 0))
			)
		).toBeLessThanOrEqual(1);
		const [configuredBorder, customBorder] = await Promise.all([
			configuredPane.evaluate(
				(element) => getComputedStyle(element).borderRightWidth
			),
			customPane.evaluate(
				(element) => getComputedStyle(element).borderLeftWidth
			),
		]);
		expect(configuredBorder).toBe("0px");
		expect(customBorder).toBe("0px");
		const [configuredPadding, customPadding] = await Promise.all([
			configuredPane.locator("[data-cron-pane-scroll]").evaluate((element) => {
				const style = getComputedStyle(element);
				return { left: style.paddingLeft, right: style.paddingRight };
			}),
			customPane.locator("[data-cron-pane-scroll]").evaluate((element) => {
				const style = getComputedStyle(element);
				return { left: style.paddingLeft, right: style.paddingRight };
			}),
		]);
		expect(configuredPadding).toEqual({ left: "16px", right: "8px" });
		expect(customPadding).toEqual({ left: "8px", right: "16px" });
		expect(
			1920 - ((customBox?.x ?? 0) + (customBox?.width ?? 0))
		).toBeLessThanOrEqual(1);
		const [configuredHeaderBox, customHeaderBox] = await Promise.all([
			configuredPane.locator("header").boundingBox(),
			customPane.locator("header").boundingBox(),
		]);
		expect(configuredHeaderBox?.height).toBe(customHeaderBox?.height);

		await configuredPane
			.getByRole("button", { name: "Duplicate cron" })
			.click();
		const customRow = customPane.locator("[data-row-id]").first();
		expect(
			await customRow.getByText("Cron expression", { exact: true }).count()
		).toBe(0);
		expect(
			await customRow.getByText(/This custom cron is saved locally/).count()
		).toBe(0);
		const [cronInputBox, triggerBox, duplicateBox, removeBox] =
			await Promise.all([
				customRow.getByLabel("Cron expression").boundingBox(),
				customRow
					.getByRole("button", { name: "Trigger", exact: true })
					.boundingBox(),
				customRow.getByRole("button", { name: "Duplicate cron" }).boundingBox(),
				customRow.getByRole("button", { name: "Remove row" }).boundingBox(),
			]);
		expect(
			Math.abs((cronInputBox?.y ?? 0) - (triggerBox?.y ?? 0))
		).toBeLessThanOrEqual(1);
		expect((cronInputBox?.x ?? 0) + (cronInputBox?.width ?? 0)).toBeLessThan(
			triggerBox?.x ?? 0
		);
		expect(triggerBox?.height).toBe(cronInputBox?.height);
		expect(duplicateBox?.height).toBe(cronInputBox?.height);
		expect(removeBox?.height).toBe(cronInputBox?.height);
		const cardPadding = await customRow.evaluate((element) => {
			const style = getComputedStyle(element);
			return { left: style.paddingLeft, top: style.paddingTop };
		});
		expect(cardPadding.left).toBe(cardPadding.top);
		await customRow.getByRole("button", { name: "Build expression" }).click();
		expect(await customRow.locator("fieldset code").count()).toBe(0);
		expect(
			await customRow
				.getByText(/Step values start at the field minimum/)
				.count()
		).toBe(0);
		await customRow.getByRole("button", { name: "Cron builder help" }).hover();
		await page.getByText(/Step values start at the field minimum/).waitFor();
		await customRow.getByRole("button", { name: "Custom time" }).click();
		const expressionControls = customRow.locator(
			"[data-cron-expression-controls]"
		);
		const timeControls = customRow.locator("[data-cron-time-controls]");
		const [wideExpressionBox, wideTimeBox] = await Promise.all([
			expressionControls.boundingBox(),
			timeControls.boundingBox(),
		]);
		expect(
			Math.abs((wideExpressionBox?.y ?? 0) - (wideTimeBox?.y ?? 0))
		).toBeLessThanOrEqual(1);
		expect(wideTimeBox?.x ?? 0).toBeGreaterThan(wideExpressionBox?.x ?? 0);
		expect(
			await customRow.evaluate(
				(element) => element.scrollWidth <= element.clientWidth
			)
		).toBe(true);

		await page.setViewportSize({ height: 720, width: 1280 });
		const [narrowExpressionBox, narrowTimeBox] = await Promise.all([
			expressionControls.boundingBox(),
			timeControls.boundingBox(),
		]);
		expect(narrowTimeBox?.y ?? 0).toBeGreaterThan(
			(narrowExpressionBox?.y ?? 0) + (narrowExpressionBox?.height ?? 0)
		);
		expect(
			await customRow.evaluate(
				(element) => element.scrollWidth <= element.clientWidth
			)
		).toBe(true);
	});

	test("duplicates a configured cron and sends an immutable one-off request", async ({
		expect,
	}) => {
		await mockWorkers(["0 17 * * sun"]);
		let body: unknown;
		await page.route(SCHEDULED_ROUTE, async (route) => {
			body = route.request().postDataJSON();
			await route.fulfill({
				body: JSON.stringify({
					errors: [],
					messages: [],
					result: { noRetry: true, outcome: "ok" },
					success: true,
				}),
				contentType: "application/json",
			});
		});
		await page.goto(
			new URL("/cdn-cgi/local/explorer/?worker=cron-worker", viteUrl).toString()
		);
		await page.evaluate(() => {
			document.documentElement.dataset.navigationMarker = "preserved";
		});
		await page.getByRole("link", { name: "Cron Triggers" }).click();
		expect(new URL(page.url()).searchParams.get("worker")).toBeNull();
		expect(
			await page.evaluate(
				() => document.documentElement.dataset.navigationMarker
			)
		).toBeUndefined();
		await page.getByLabel("Cron expression").waitFor();
		const configuredPane = page.getByRole("region", {
			name: "Configured crons",
		});
		const customPane = page.getByRole("region", { name: "Custom crons" });
		const [configuredBox, customBox] = await Promise.all([
			configuredPane.boundingBox(),
			customPane.boundingBox(),
		]);
		expect(configuredBox?.x).toBeLessThan(customBox?.x ?? 0);
		expect(
			Math.abs((configuredBox?.width ?? 0) - (customBox?.width ?? 0))
		).toBe(0);
		expect(
			await configuredPane
				.locator("[data-cron-pane-scroll]")
				.evaluate((element) => getComputedStyle(element).overflowY)
		).toBe("auto");
		expect(
			await customPane
				.locator("[data-cron-pane-scroll]")
				.evaluate((element) => getComputedStyle(element).overflowY)
		).toBe("auto");
		const cronInputs = page.getByLabel("Cron expression");
		await cronInputs.waitFor();
		expect(await cronInputs.first().inputValue()).toBe("0 17 * * sun");
		await page.getByRole("button", { name: "Duplicate cron" }).click();
		await expect.poll(() => cronInputs.count()).toBe(2);
		await expect
			.poll(() =>
				page
					.getByRole("button", { name: "Now" })
					.last()
					.getAttribute("aria-pressed")
			)
			.toBe("true");

		await configuredPane
			.getByRole("button", { name: "Duplicate cron" })
			.click();
		await expect
			.poll(() => customPane.locator("[data-row-id]").count())
			.toBe(2);
		expect(
			await page
				.getByRole("heading", {
					exact: true,
					name: /Configured Cron|Custom Cron/,
				})
				.count()
		).toBe(0);
		await customPane
			.getByRole("button", { name: "Remove row" })
			.first()
			.click();
		await expect
			.poll(() =>
				customPane
					.getByLabel("Cron expression")
					.evaluate((element) => element === document.activeElement)
			)
			.toBe(true);

		const before = Date.now();
		await page
			.getByRole("button", { name: "Trigger", exact: true })
			.last()
			.click();
		await page.getByText("Outcome: ok").waitFor();
		const after = Date.now();
		expect(body).toMatchObject({ cron: "0 17 * * sun" });
		const scheduledTime = (body as { scheduled_time: number }).scheduled_time;
		expect(scheduledTime).toBeGreaterThanOrEqual(before);
		expect(scheduledTime).toBeLessThanOrEqual(after);
		await page.getByText(/one-off local test/).waitFor();
	});

	test("sends custom times only as UTC calendar values or epoch milliseconds", async ({
		expect,
	}) => {
		await mockWorkers(["0 17 * * sun"]);
		const bodies: Array<{ cron: string; scheduled_time: number }> = [];
		await page.route(SCHEDULED_ROUTE, async (route) => {
			bodies.push(route.request().postDataJSON());
			await route.fulfill({
				body: JSON.stringify({
					errors: [],
					messages: [],
					result: { noRetry: false, outcome: "ok" },
					success: true,
				}),
				contentType: "application/json",
			});
		});
		await openCronTriggers();
		await page.getByRole("button", { name: "Custom time" }).click();
		expect(await page.getByText("Time zone", { exact: true }).count()).toBe(0);

		await page
			.getByLabel("Date and Time (UTC)")
			.fill("2026-01-10T12:30:45.123");
		await page.getByRole("button", { name: "Trigger", exact: true }).click();
		await expect.poll(() => bodies.length).toBe(1);
		expect(bodies[0]).toEqual({
			cron: "0 17 * * sun",
			scheduled_time: Date.parse("2026-01-10T12:30:45.123Z"),
		});

		await page.getByRole("button", { name: "Epoch milliseconds" }).click();
		await page.getByLabel("Epoch milliseconds").fill("-1");
		await page.getByRole("button", { name: "Trigger", exact: true }).click();
		await expect.poll(() => bodies.length).toBe(2);
		expect(bodies[1]).toEqual({
			cron: "0 17 * * sun",
			scheduled_time: -1,
		});
	});

	test("preserves custom time drafts after switching to now", async ({
		expect,
	}) => {
		await mockWorkers(["0 17 * * sun"]);
		await openCronTriggers();
		await page.getByRole("button", { name: "Custom time" }).click();

		const calendarInput = page.getByLabel("Date and Time (UTC)");
		await calendarInput.fill("2026-01-10T12:30:45.123");
		await page.getByRole("button", { name: "Now", exact: true }).click();
		await page.getByRole("button", { name: "Custom time" }).click();
		expect(await calendarInput.inputValue()).toBe("2026-01-10T12:30:45.123");

		await page.getByRole("button", { name: "Epoch milliseconds" }).click();
		const epochInput = page.getByLabel("Epoch milliseconds");
		await epochInput.fill("123456789");
		await page.getByRole("button", { name: "Now", exact: true }).click();
		await page.getByRole("button", { name: "Custom time" }).click();
		expect(await epochInput.inputValue()).toBe("123456789");
	});

	test("restores persisted custom drafts as idle rows after navigation and reload", async ({
		expect,
	}) => {
		await mockWorkers(["0 17 * * sun"]);
		await page.route(SCHEDULED_ROUTE, async (route) => {
			await route.fulfill({
				body: JSON.stringify({
					errors: [],
					messages: [],
					result: { noRetry: false, outcome: "ok" },
					success: true,
				}),
				contentType: "application/json",
			});
		});
		await openCronTriggers();
		await page.getByRole("button", { name: "Duplicate cron" }).click();
		await page.getByLabel("Cron expression").last().fill("15 4 * * *");
		await page.getByRole("button", { name: "Custom time" }).last().click();
		await page
			.getByRole("button", { name: "Epoch milliseconds" })
			.last()
			.click();
		await page.getByLabel("Epoch milliseconds").fill("123456789");
		await page
			.getByRole("button", { name: "Trigger", exact: true })
			.last()
			.click();
		await page.getByText("Outcome: ok").waitFor();
		await page.getByRole("button", { name: "Build expression" }).last().click();
		await page.getByLabel("Hour (UTC)").last().fill("");
		await expect
			.poll(() =>
				page.evaluate(
					(prefix) =>
						Object.keys(localStorage).some((key) => key.startsWith(prefix)),
					STORAGE_PREFIX
				)
			)
			.toBe(true);

		await page.getByRole("link", { name: "Traces" }).click();
		await page.getByRole("link", { name: "Cron Triggers" }).click();

		await page.getByLabel("Cron expression").last().waitFor();
		expect(
			await page
				.getByRole("button", { name: "Build expression" })
				.last()
				.getAttribute("aria-pressed")
		).toBe("true");
		expect(await page.getByLabel("Hour (UTC)").last().inputValue()).toBe("");
		expect(await page.getByLabel("Epoch milliseconds").inputValue()).toBe(
			"123456789"
		);
		expect(await page.getByText("Outcome: ok").count()).toBe(0);

		await page.reload();

		await page.getByLabel("Cron expression").last().waitFor();
		expect(await page.getByLabel("Cron expression").last().inputValue()).toBe(
			"15 4 * * *"
		);
		expect(await page.getByLabel("Epoch milliseconds").inputValue()).toBe(
			"123456789"
		);
		expect(await page.getByText("Outcome: ok").count()).toBe(0);
		expect(await page.getByText("Invocation is running…").count()).toBe(0);
	});
});
