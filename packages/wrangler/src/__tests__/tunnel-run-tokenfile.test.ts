import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../tunnel/cloudflared", async () => {
	const actual = await vi.importActual<typeof import("../tunnel/cloudflared")>(
		"../tunnel/cloudflared"
	);
	return {
		...actual,
		spawnCloudflared: vi.fn(async (_args: string[]) => {
			const cp = new EventEmitter() as any;
			cp.stderr = null;
			cp.killed = false;
			cp.kill = () => {
				cp.killed = true;
			};
			return cp;
		}),
	};
});

import { tunnelRunCommand } from "../tunnel/run";
import { spawnCloudflared } from "../tunnel/cloudflared";

describe("tunnel run", () => {
	let tempDir: string | undefined;

	afterEach(() => {
		if (tempDir) {
			fs.rmSync(tempDir, { recursive: true, force: true });
			tempDir = undefined;
		}
		vi.clearAllMocks();
	});

	it("uses --token-file when token is provided", async () => {
		const token = "TEST_TOKEN";
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wrangler-test-"));
		vi.spyOn(os, "tmpdir").mockReturnValue(tempDir!);

		const logger = {
			log: vi.fn(),
			error: vi.fn(),
			debug: vi.fn(),
		};

		await tunnelRunCommand.handler(
			{
				tunnel: undefined,
				token,
				tokenFile: undefined,
				url: undefined,
				logLevel: "info",
			} as any,
			{ config: { send_metrics: false } as any, logger, sdk: {} as any } as any
		);

		expect(spawnCloudflared).toHaveBeenCalledTimes(1);
		const calledArgs = (spawnCloudflared as any).mock.calls[0][0] as string[];
		expect(calledArgs).toContain("--token-file");
		expect(calledArgs).not.toContain("--token");

		const tokenFileIndex = calledArgs.indexOf("--token-file");
		const tokenPath = calledArgs[tokenFileIndex + 1];
		expect(fs.readFileSync(tokenPath, "utf8").trim()).toBe(token);
		if (process.platform !== "win32") {
			const mode = fs.statSync(tokenPath).mode & 0o777;
			expect(mode).toBe(0o600);
		}
	});
});
