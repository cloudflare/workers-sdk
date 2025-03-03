import { resolve } from "node:path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

const devCmds = [{ args: [] }, { args: ["--x-assets-rpc"] }];

describe.each(devCmds)(
	"[wrangler dev $args][Workers + Assets] run_worker_first true",
	({ args }) => {
		let ip: string, port: number, stop: (() => Promise<unknown>) | undefined;

		beforeAll(async () => {
			({ ip, port, stop } = await runWranglerDev(resolve(__dirname, ".."), [
				"--port=0",
				"--inspector-port=0",
				...args,
			]));
		});

		afterAll(async () => {
			await stop?.();
		});

		it("should return a 403 without an Authorization header", async ({
			expect,
		}) => {
			let response = await fetch(`http://${ip}:${port}/index.html`);
			let text = await response.text();
			expect(response.status).toBe(403);
		});

		it("should return a 200 with an Authorization header", async ({
			expect,
		}) => {
			let response = await fetch(`http://${ip}:${port}/index.html`, {
				headers: { Authorization: "some auth header" },
			});
			let text = await response.text();

			expect(response.status).toBe(200);
			expect(text).toContain(`<h1>Hello Workers + Assets World 🚀!</h1>`);
		});
	}
);
