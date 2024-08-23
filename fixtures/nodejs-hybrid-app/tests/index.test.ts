import { resolve } from "node:path";
import { fetch } from "undici";
import { describe, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("nodejs compat", () => {
	it("should work when running code requiring polyfills", async ({
		expect,
	}) => {
		const { ip, port, stop } = await runWranglerDev(
			resolve(__dirname, "../src"),
			["--port=0", "--inspector-port=0"]
		);
		try {
			const response = await fetch(`http://${ip}:${port}/test-process`);
			const body = await response.text();
			expect(body).toMatchInlineSnapshot(`"OK!"`);

			// Disabling actually querying the database since we are getting this error:
			// > too many connections for role 'reader'
			// const response = await fetch(`http://${ip}:${port}/query`);
			// const body = await response.text();
			// console.log(body);
			// const result = JSON.parse(body) as { id: string };
			// expect(result.id).toEqual("1");
		} finally {
			await stop();
		}
	});
});
