// test/index.spec.ts
import { rm } from "node:fs/promises";
import { resolve } from "path";
import { afterAll, beforeAll, describe, it, TestOptions } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

const BROWSER_RENDERING_RETRY = {
	retry: {
		condition: /Chrome readiness probe .* timed out|Test timed out/i,
		count: 3,
		delay: 1_000,
	},
} satisfies TestOptions;

describe.sequential("Local Browser", () => {
	let ip: string,
		port: number,
		stop: (() => Promise<unknown>) | undefined,
		getOutput: () => string;

	beforeAll(async () => {
		// delete previous run contents because of persistence
		await rm(resolve(__dirname, "..") + "/.wrangler", {
			force: true,
			recursive: true,
		});
		({ ip, port, stop, getOutput } = await runWranglerDev(
			resolve(__dirname, ".."),
			["--local", "--port=0", "--inspector-port=0"]
		));
	});

	afterAll(async () => {
		await stop?.();
	});

	async function fetchText(url: string) {
		const response = await fetch(url, {
			headers: {
				"MF-Disable-Pretty-Error": "1",
			},
		});
		const text = await response.text();

		return text;
	}

	for (const lib of ["puppeteer", "playwright"]) {
		describe(`using @cloudflare/${lib}`, () => {
			it("Doesn't run a browser, just testing that the worker is running!", async ({
				expect,
			}) => {
				await expect(
					fetchText(`http://${ip}:${port}/?lib=${lib}`)
				).resolves.toEqual("Please add an ?url=https://example.com/ parameter");
			});

			it(
				"Run a browser, and check h1 text content",
				BROWSER_RENDERING_RETRY,
				async ({ expect }) => {
					await expect(
						fetchText(
							`http://${ip}:${port}/?lib=${lib}&url=https://example.com&action=select`
						)
					).resolves.toEqual("Example Domain");
				}
			);

			it(
				"Run a browser, and check p text content",
				BROWSER_RENDERING_RETRY,
				async ({ expect }) => {
					await expect(
						fetchText(
							`http://${ip}:${port}/?lib=${lib}&url=https://example.com&action=alter`
						)
					).resolves.toEqual(
						`New paragraph text set by ${lib === "playwright" ? "Playwright" : "Puppeteer"}!`
					);
				}
			);

			it(
				"Disconnect a browser, and check its session connection status",
				BROWSER_RENDERING_RETRY,
				async ({ expect }) => {
					await expect(
						fetchText(
							`http://${ip}:${port}/?lib=${lib}&url=https://example.com&action=disconnect`
						)
					).resolves.toEqual(`Browser disconnected`);
				}
			);
		});
	}
});
