import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fetch } from "undici";
import { describe, it, beforeAll, afterAll } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";

const isWindows = process.platform === "win32";

describe.concurrent("Remix", () => {
	let ip: string;
	let port: number;
	let stop: () => void;

	beforeAll(async () => {
		spawnSync("npm", ["run", "build"], {
			shell: isWindows,
			cwd: resolve(__dirname, ".."),
		});
		({ ip, port, stop } = await runWranglerPagesDev(
			resolve(__dirname, ".."),
			"public",
			["--port=0"]
		));
	});

	afterAll(async () => await stop());

	it("renders", async ({ expect }) => {
		const response = await fetch(`http://${ip}:${port}/`);
		const text = await response.text();
		expect(text).toContain("Welcome to Remix");
	});
});
