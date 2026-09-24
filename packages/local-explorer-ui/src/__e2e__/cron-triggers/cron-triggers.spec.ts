import { afterEach, describe, test } from "vitest";
import { page, viteUrl } from "../utils";

const WORKERS_ROUTE = "**/cdn-cgi/local/explorer/api/local/workers";
const SCHEDULED_ROUTE =
	"**/cdn-cgi/local/explorer/api/local/scheduled?worker=*";
const STORAGE_PREFIX = "local-explorer.cron-triggers.";

interface MockWorkerMetadata {
	isSelf?: boolean;
	name: string;
	persistenceScope?: string;
	triggers: { crons: string[] };
}

async function mockWorkerMetadata(
	workers: MockWorkerMetadata[]
): Promise<void> {
	await page.route(WORKERS_ROUTE, async (route) => {
		await route.fulfill({
			body: JSON.stringify({
				errors: [],
				messages: [],
				result: workers,
				success: true,
			}),
			contentType: "application/json",
		});
	});
}

async function mockWorkers(crons: string[]): Promise<void> {
	await mockWorkerMetadata([
		{
			isSelf: true,
			name: "cron-worker",
			persistenceScope: "cron-e2e-project",
			triggers: { crons },
		},
	]);
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
		await expect
			.poll(() => new URL(page.url()).searchParams.get("worker"))
			.toBeNull();
		await page
			.getByRole("heading", { name: "No Cron Triggers configured" })
			.waitFor();
		expect(
			await page.getByRole("button", { name: "Add trigger" }).count()
		).toBe(0);
		expect(
			await page.getByRole("button", { name: "Trigger", exact: true }).count()
		).toBe(0);
	});

	test("recovers Worker selection after bootstrap fails", async ({
		expect,
	}) => {
		let requestCount = 0;
		const refreshHeaders: Array<string | undefined> = [];
		let releaseRefresh: (() => void) | undefined;
		const delayedRefresh = new Promise<void>((resolve) => {
			releaseRefresh = resolve;
		});
		await page.route(WORKERS_ROUTE, async (route) => {
			requestCount += 1;
			refreshHeaders.push(
				route.request().headers()["x-miniflare-explorer-refresh"]
			);
			if (requestCount === 2) {
				await route.fulfill({
					body: JSON.stringify({
						errors: [],
						messages: [],
						result: [],
						success: true,
					}),
					contentType: "application/json",
				});
				return;
			}
			if (requestCount > 2) {
				await delayedRefresh;
				await route.fulfill({
					body: JSON.stringify({
						errors: [],
						messages: [],
						result: [
							{
								isSelf: true,
								name: "worker-1",
								persistenceScope: "cron-project-1",
								triggers: { crons: ["recovered-cron"] },
							},
							{
								isSelf: false,
								name: "worker-2",
								persistenceScope: "cron-project-2",
								triggers: { crons: ["peer-cron"] },
							},
						],
						success: true,
					}),
					contentType: "application/json",
				});
				return;
			}
			await route.fulfill({
				body: JSON.stringify({
					errors: [{ code: 10000, message: "Workers unavailable" }],
					messages: [],
					success: false,
				}),
				contentType: "application/json",
				status: 500,
			});
		});

		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/cron-triggers/configured?worker=requested-worker",
				viteUrl
			).toString()
		);
		await expect
			.poll(() => page.locator("body").innerText())
			.toContain("Cron Triggers are unavailable");
		expect(new URL(page.url()).searchParams.get("worker")).toBe(
			"requested-worker"
		);

		await expect.poll(() => requestCount).toBe(2);
		await page.getByRole("button", { name: "Refresh Cron Triggers" }).click();
		releaseRefresh?.();
		await expect
			.poll(() => new URL(page.url()).searchParams.get("worker"))
			.toBe("worker-1");
		await expect
			.poll(() => page.getByLabel("Cron expression").first().inputValue())
			.toBe("recovered-cron");
		expect(refreshHeaders).toContain("poll");

		const workerSelector = page
			.getByRole("combobox")
			.filter({ hasText: "worker-1" });
		await workerSelector.click();
		await page.getByRole("option", { name: "worker-2" }).click();
		await expect
			.poll(() => new URL(page.url()).searchParams.get("worker"))
			.toBe("worker-2");
		await expect
			.poll(() => page.getByLabel("Cron expression").first().inputValue())
			.toBe("peer-cron");
	});

	test("canonicalizes Worker selection and retains it across metadata refreshes", async ({
		expect,
	}) => {
		const workers: MockWorkerMetadata[] = [
			{
				isSelf: true,
				name: "worker-1",
				persistenceScope: "cron-project-1",
				triggers: { crons: ["first-worker-cron"] },
			},
			{
				name: "worker-2",
				persistenceScope: "cron-project-2",
				triggers: { crons: ["second-worker-cron"] },
			},
		];
		await mockWorkerMetadata(workers);
		const requestedWorkers: Array<string | null> = [];
		await page.route(SCHEDULED_ROUTE, async (route) => {
			requestedWorkers.push(
				new URL(route.request().url()).searchParams.get("worker")
			);
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

		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/cron-triggers/configured",
				viteUrl
			).toString()
		);
		await expect
			.poll(() => new URL(page.url()).searchParams.get("worker"))
			.toBe("worker-1");

		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/cron-triggers/configured?worker=missing-worker",
				viteUrl
			).toString()
		);
		await expect
			.poll(() => new URL(page.url()).searchParams.get("worker"))
			.toBe("worker-1");
		expect(await page.getByLabel("Cron expression").inputValue()).toBe(
			"first-worker-cron"
		);
		await page.getByRole("button", { name: "Trigger", exact: true }).click();
		await expect.poll(() => requestedWorkers).toEqual(["worker-1"]);

		requestedWorkers.length = 0;
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/cron-triggers/configured?worker=worker-2",
				viteUrl
			).toString()
		);
		expect(await page.getByLabel("Cron expression").inputValue()).toBe(
			"second-worker-cron"
		);
		await page.getByRole("button", { name: "Trigger", exact: true }).click();
		await expect.poll(() => requestedWorkers).toEqual(["worker-2"]);

		requestedWorkers.length = 0;
		workers.splice(1, 1);
		await page.getByRole("button", { name: "Refresh Cron Triggers" }).click();
		await page.getByText(/Existing rows may be stale/).waitFor();
		expect(
			await page.getByRole("combobox").filter({ hasText: "worker-2" }).count()
		).toBe(1);
		expect(await page.getByLabel("Cron expression").inputValue()).toBe(
			"second-worker-cron"
		);
		await page.getByRole("button", { name: "Trigger", exact: true }).click();
		await expect.poll(() => requestedWorkers).toEqual(["worker-2"]);

		workers.push({
			name: "worker-3",
			persistenceScope: "cron-project-3",
			triggers: { crons: ["third-worker-cron"] },
		});
		await page.getByRole("button", { name: "Refresh Cron Triggers" }).click();
		const workerSelector = page
			.getByRole("combobox")
			.filter({ hasText: "worker-2" });
		await workerSelector.click();
		await page.getByRole("option", { name: "worker-3" }).click();
		await expect
			.poll(() => new URL(page.url()).searchParams.get("worker"))
			.toBe("worker-3");
	});

	test("clears configured results when persistence scope changes", async ({
		expect,
	}) => {
		const worker: MockWorkerMetadata = {
			isSelf: true,
			name: "cron-worker",
			persistenceScope: "project-a",
			triggers: { crons: ["0 17 * * sun"] },
		};
		const workers = [worker];
		await mockWorkerMetadata(workers);
		await page.route(SCHEDULED_ROUTE, async (route) => {
			await route.fulfill({
				body: JSON.stringify({
					errors: [],
					messages: [],
					result: { noRetry: false, outcome: "project-a-result" },
					success: true,
				}),
				contentType: "application/json",
			});
		});
		await openCronTriggers();
		await page.getByRole("button", { name: "Trigger", exact: true }).click();
		await page.getByText("project-a-result").waitFor();

		worker.persistenceScope = "project-b";
		await page.getByRole("button", { name: "Refresh Cron Triggers" }).click();
		await expect.poll(() => page.getByText("project-a-result").count()).toBe(0);
	});

	test("uses full-width routed views and removes cron duplication", async ({
		expect,
	}) => {
		await page.setViewportSize({ height: 900, width: 1920 });
		await mockWorkers(["0 17 * * sun"]);
		await openCronTriggers();

		const configuredLink = page.getByRole("link", {
			name: "Configured Crons",
		});
		const adHocLink = page.getByRole("link", { name: "Ad-Hoc Triggers" });
		await configuredLink.waitFor();
		await expect
			.poll(() => new URL(page.url()).pathname)
			.toMatch(/\/cron-triggers\/configured$/);
		const configuredPanel = page.getByRole("region", {
			name: "Configured Crons",
		});
		const panelBox = await configuredPanel.boundingBox();
		const rowListBox = await configuredPanel
			.locator("[data-cron-row-list]")
			.boundingBox();
		expect(Math.abs((panelBox?.width ?? 0) - (rowListBox?.width ?? 0))).toBe(0);
		expect(
			await page.getByRole("button", { name: "Duplicate cron" }).count()
		).toBe(0);

		await adHocLink.click();
		await expect
			.poll(() => new URL(page.url()).pathname)
			.toMatch(/\/cron-triggers\/ad-hoc$/);
		const adHocPanel = page.getByRole("region", { name: "Ad-Hoc Triggers" });
		await adHocPanel.getByRole("button", { name: "Add trigger" }).click();
		const row = adHocPanel.locator("[data-row-id]");
		await row.getByLabel("Cron expression").fill("15 4 * * *");
		const copyButton = row.getByRole("button", {
			name: "Copy expression",
		});
		const [inputBox, triggerBox, copyBox, removeBox] = await Promise.all([
			row.getByLabel("Cron expression").boundingBox(),
			row.getByRole("button", { name: "Trigger", exact: true }).boundingBox(),
			copyButton.boundingBox(),
			row.getByRole("button", { name: "Remove row" }).boundingBox(),
		]);
		expect(Math.abs((inputBox?.y ?? 0) - (triggerBox?.y ?? 0))).toBeLessThan(2);
		expect(triggerBox?.height).toBe(inputBox?.height);
		expect(copyBox?.height).toBe(inputBox?.height);
		expect(removeBox?.height).toBe(inputBox?.height);
		expect(copyBox?.x ?? 0).toBeGreaterThan(
			(triggerBox?.x ?? 0) + (triggerBox?.width ?? 0)
		);
		expect(removeBox?.x ?? 0).toBeGreaterThan(
			(copyBox?.x ?? 0) + (copyBox?.width ?? 0)
		);
		await row.evaluate((element) => {
			Object.defineProperty(navigator, "clipboard", {
				configurable: true,
				value: {
					writeText: (text: string) => {
						element.setAttribute("data-copied-cron", text);
						return Promise.resolve();
					},
				},
			});
		});
		await copyButton.click();
		expect(await row.getAttribute("data-copied-cron")).toBe("15 4 * * *");
		await row.getByRole("button", { name: "Build expression" }).click();
		expect(await row.getByLabel("Cron expression").inputValue()).toBe(
			"15 4 * * *"
		);
		expect(
			await row
				.getByRole("button", { name: "Use generated expression" })
				.count()
		).toBe(0);
		expect(
			await row.getByText("Complete the builder before triggering.").count()
		).toBe(0);
		const hourInput = row.getByRole("textbox", { name: "Hour" });
		await hourInput.fill("2");
		expect(await row.getByLabel("Cron expression").inputValue()).toBe(
			"0 2 * * *"
		);
		await hourInput.fill("25");
		const hourLabel = row.getByText("Hour", { exact: true });
		const hourError = row.getByText("must be between 0 and 23.", {
			exact: true,
		});
		const [hourLabelBox, hourErrorBox, hourLabelColor, hourErrorColor] =
			await Promise.all([
				hourLabel.boundingBox(),
				hourError.boundingBox(),
				hourLabel.evaluate((element) => getComputedStyle(element).color),
				hourError.evaluate((element) => getComputedStyle(element).color),
			]);
		expect(
			Math.abs(
				(hourLabelBox?.y ?? 0) +
					(hourLabelBox?.height ?? 0) / 2 -
					((hourErrorBox?.y ?? 0) + (hourErrorBox?.height ?? 0) / 2)
			)
		).toBeLessThan(2);
		expect(hourLabelColor).not.toBe(hourErrorColor);
		expect(await hourInput.getAttribute("aria-invalid")).toBe("true");
		await row
			.getByLabel("Schedule")
			.selectOption({ label: "Selected weekdays" });
		const weekdays = row.getByRole("group", { name: "Weekdays" });
		await weekdays.getByRole("checkbox", { name: "mon" }).uncheck();
		expect(await weekdays.getAttribute("aria-invalid")).toBe("true");
		const weekdayError = weekdays.getByText("Select at least one weekday.");
		const [saturdayBox, weekdayErrorBox] = await Promise.all([
			weekdays.getByText("sat", { exact: true }).boundingBox(),
			weekdayError.boundingBox(),
		]);
		expect(
			Math.abs(
				(saturdayBox?.y ?? 0) +
					(saturdayBox?.height ?? 0) / 2 -
					((weekdayErrorBox?.y ?? 0) + (weekdayErrorBox?.height ?? 0) / 2)
			)
		).toBeLessThan(2);
		await row.getByRole("button", { name: "Cron builder help" }).hover();
		await page.getByText(/Step values start at the field minimum/).waitFor();
		expect(
			await row.evaluate(
				(element) => element.scrollWidth <= element.clientWidth
			)
		).toBe(true);
	});

	test("saves and uses UTC and epoch presets in both views", async ({
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
		await page.getByText("Selected epoch: now").waitFor();
		const scheduledTimeSelect = page.getByRole("combobox", {
			name: "Scheduled time",
		});
		const addPreset = page.getByRole("button", { name: "Add preset" });
		const removePreset = page.getByRole("button", { name: "Remove preset" });
		const [selectBox, addBox, removeBox] = await Promise.all([
			scheduledTimeSelect.boundingBox(),
			addPreset.boundingBox(),
			removePreset.boundingBox(),
		]);
		expect(addBox?.height).toBe(selectBox?.height);
		expect(removeBox?.height).toBe(selectBox?.height);
		expect(Math.abs((addBox?.y ?? 0) - (selectBox?.y ?? 0))).toBeLessThan(2);
		expect(Math.abs((removeBox?.y ?? 0) - (selectBox?.y ?? 0))).toBeLessThan(2);
		expect(await removePreset.textContent()).toBe("");
		expect(await removePreset.getAttribute("aria-disabled")).toBe("true");

		await addPreset.click();
		const calendarInput = page.getByLabel("Date and time (UTC)");
		const cancelPreset = page.getByRole("button", { name: "Cancel" });
		const savePreset = page.getByRole("button", { name: "Save preset" });
		const [calendarBox, cancelBox, saveBox] = await Promise.all([
			calendarInput.boundingBox(),
			cancelPreset.boundingBox(),
			savePreset.boundingBox(),
		]);
		expect(cancelBox?.height).toBe(calendarBox?.height);
		expect(saveBox?.height).toBe(calendarBox?.height);
		expect(Math.abs((cancelBox?.y ?? 0) - (calendarBox?.y ?? 0))).toBeLessThan(
			2
		);
		expect(Math.abs((saveBox?.y ?? 0) - (calendarBox?.y ?? 0))).toBeLessThan(2);
		await page
			.getByLabel("Date and time (UTC)")
			.fill("2026-01-10T12:30:45.123");
		await savePreset.click();
		expect(await removePreset.getAttribute("aria-disabled")).toBe("false");
		await page.getByRole("button", { name: "Trigger", exact: true }).click();
		await expect.poll(() => bodies.length).toBe(1);
		expect(bodies[0]).toEqual({
			cron: "0 17 * * sun",
			scheduled_time: Date.parse("2026-01-10T12:30:45.123Z"),
		});

		await page.getByRole("link", { name: "Ad-Hoc Triggers" }).click();
		await page.getByRole("combobox", { name: "Scheduled time" }).click();
		await page
			.getByRole("option", { name: "2026-01-10T12:30:45.123Z" })
			.click();
		await page.getByRole("button", { name: "Add trigger" }).click();
		await page.getByLabel("Cron expression").fill("15 4 * * *");
		await page.getByRole("button", { name: "Trigger", exact: true }).click();
		await expect.poll(() => bodies.length).toBe(2);
		expect(bodies[1]).toEqual({
			cron: "15 4 * * *",
			scheduled_time: Date.parse("2026-01-10T12:30:45.123Z"),
		});
		await page.getByRole("button", { name: "Build expression" }).click();
		await page.getByRole("textbox", { name: "Hour" }).fill("");
		await page.getByRole("button", { name: "Trigger", exact: true }).click();
		await expect.poll(() => bodies.length).toBe(3);
		expect(bodies[2]).toEqual({
			cron: "15 4 * * *",
			scheduled_time: Date.parse("2026-01-10T12:30:45.123Z"),
		});

		await page.getByRole("button", { name: "Add preset" }).click();
		await page.getByRole("button", { name: "Epoch milliseconds" }).click();
		await page.getByLabel("Epoch milliseconds").fill("");
		await expect
			.poll(() =>
				page.getByRole("button", { name: "Save preset" }).isDisabled()
			)
			.toBe(true);
		await page.getByLabel("Epoch milliseconds").fill("-1");
		await expect.poll(() => savePreset.isEnabled()).toBe(true);
		await savePreset.click();
		await page.getByRole("button", { name: "Trigger", exact: true }).click();
		await expect.poll(() => bodies.length).toBe(4);
		expect(bodies[3]?.scheduled_time).toBe(-1);

		await removePreset.click();
		expect(await removePreset.getAttribute("aria-disabled")).toBe("true");
		await page.getByText("Selected epoch: now").waitFor();
		expect(
			await page.getByRole("combobox", { name: "Scheduled time" }).textContent()
		).toContain("Now");
		await page.getByRole("combobox", { name: "Scheduled time" }).click();
		expect(
			await page
				.getByRole("option", { name: "1969-12-31T23:59:59.999Z" })
				.count()
		).toBe(0);
		await page.keyboard.press("Escape");
	});

	test("restores and retains ad-hoc drafts and time presets", async ({
		expect,
	}) => {
		const configuredCrons = ["0 17 * * sun"];
		await mockWorkers(configuredCrons);
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
		await page.getByRole("button", { name: "Add preset" }).click();
		await page.getByRole("button", { name: "Epoch milliseconds" }).click();
		await page.getByLabel("Epoch milliseconds").fill("123456789");
		await page.getByRole("button", { name: "Save preset" }).click();
		await page.getByRole("link", { name: "Ad-Hoc Triggers" }).click();
		await page.getByRole("combobox", { name: "Scheduled time" }).click();
		await page
			.getByRole("option", { name: "1970-01-02T10:17:36.789Z" })
			.click();
		await page.getByRole("button", { name: "Add trigger" }).click();
		await page.getByLabel("Cron expression").fill("15 4 * * *");
		await page.getByRole("button", { name: "Build expression" }).click();
		await page.getByRole("textbox", { name: "Hour" }).fill("");
		expect(
			await page
				.getByRole("button", { name: "Trigger", exact: true })
				.getAttribute("aria-disabled")
		).toBe("false");
		await expect
			.poll(() =>
				page.evaluate(
					(prefix) =>
						Object.keys(localStorage).filter((key) => key.startsWith(prefix))
							.length,
					STORAGE_PREFIX
				)
			)
			.toBe(2);

		await page.getByRole("link", { name: "Traces" }).click();
		await page.getByRole("link", { name: "Ad-Hoc Triggers" }).click();
		await page.getByLabel("Cron expression").waitFor();
		expect(await page.getByLabel("Cron expression").inputValue()).toBe(
			"15 4 * * *"
		);
		expect(await page.getByRole("textbox", { name: "Hour" }).inputValue()).toBe(
			""
		);
		await page.getByRole("combobox", { name: "Scheduled time" }).click();
		await expect
			.poll(() =>
				page.getByRole("option", { name: "1970-01-02T10:17:36.789Z" }).count()
			)
			.toBe(1);
		await page.keyboard.press("Escape");

		await page.reload();
		await page.getByLabel("Cron expression").waitFor();
		expect(await page.getByLabel("Cron expression").inputValue()).toBe(
			"15 4 * * *"
		);
		await page.getByRole("combobox", { name: "Scheduled time" }).click();
		await expect
			.poll(() =>
				page.getByRole("option", { name: "1970-01-02T10:17:36.789Z" }).count()
			)
			.toBe(1);
		await page.keyboard.press("Escape");
		expect(await page.getByText("Invocation is running…").count()).toBe(0);

		configuredCrons.length = 0;
		await page.getByRole("button", { name: "Refresh Cron Triggers" }).click();
		await page
			.getByRole("heading", { name: "No Cron Triggers configured" })
			.waitFor();
		expect(await page.getByLabel("Cron expression").inputValue()).toBe(
			"15 4 * * *"
		);
		expect(
			await page
				.getByRole("button", { name: "Trigger", exact: true })
				.getAttribute("aria-disabled")
		).toBe("true");
		expect(
			await page.getByRole("button", { name: "Add trigger" }).count()
		).toBe(0);
	});
});
