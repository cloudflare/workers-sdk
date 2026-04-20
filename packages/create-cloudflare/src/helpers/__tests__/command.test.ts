import { spawn } from "cross-spawn";
import { readMetricsConfig } from "helpers/metrics-config";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import { runWranglerCommand } from "../command";
import type { ChildProcess } from "node:child_process";

let spawnResultCode = 0;

vi.mock("cross-spawn");
vi.mock("helpers/metrics-config");

describe("runWranglerCommand", () => {
	afterEach(() => {
		spawnResultCode = 0;
	});

	beforeEach(() => {
		vi.mocked(spawn).mockImplementation(() => {
			return {
				on: vi.fn().mockImplementation((event, cb) => {
					if (event === "close") {
						cb(spawnResultCode);
					}
				}),
				stdout: {
					on(_event: "data", _cb: (data: string) => void) {},
				},
				stderr: {
					on(_event: "data", _cb: (data: string) => void) {},
				},
			} as unknown as ChildProcess;
		});
	});

	test("has WRANGLER_SEND_METRICS=false when c3 telemetry is disabled", async ({
		expect,
	}) => {
		vi.mocked(readMetricsConfig).mockReturnValue({
			c3permission: {
				enabled: false,
				date: new Date(2000, 0, 1),
			},
		});
		await runWranglerCommand(["npx", "wrangler", "login"]);

		expect(spawn).toHaveBeenCalledWith(
			"npx",
			["wrangler", "login"],
			expect.objectContaining({
				env: expect.objectContaining({
					WRANGLER_SEND_METRICS: "false",
					WRANGLER_HIDE_BANNER: "true",
				}),
			})
		);
	});

	test("doesn't have WRANGLER_SEND_METRICS=false when c3 telemetry is enabled", async ({
		expect,
	}) => {
		vi.mocked(readMetricsConfig).mockReturnValue({
			c3permission: {
				enabled: true,
				date: new Date(2000, 0, 1),
			},
		});
		await runWranglerCommand(["npx", "wrangler", "login"]);

		expect(spawn).toHaveBeenCalledWith(
			"npx",
			["wrangler", "login"],
			expect.objectContaining({
				env: expect.objectContaining({
					WRANGLER_HIDE_BANNER: "true",
				}),
			})
		);
		expect(spawn).toHaveBeenCalledWith(
			"npx",
			["wrangler", "login"],
			expect.objectContaining({
				env: expect.not.objectContaining({
					WRANGLER_SEND_METRICS: "false",
				}),
			})
		);
	});

	test("always has WRANGLER_HIDE_BANNER=true", async ({ expect }) => {
		vi.mocked(readMetricsConfig).mockReturnValue({});
		await runWranglerCommand(["npx", "wrangler", "whoami"]);

		expect(spawn).toHaveBeenCalledWith(
			"npx",
			["wrangler", "whoami"],
			expect.objectContaining({
				env: expect.objectContaining({
					WRANGLER_HIDE_BANNER: "true",
				}),
			})
		);
	});
});
