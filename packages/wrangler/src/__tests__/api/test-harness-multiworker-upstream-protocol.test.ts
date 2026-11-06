import { writeFileSync } from "node:fs";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { createTestHarness } from "../../api/test-harness";
import { mockConsoleMethods } from "../helpers/mock-console";

/**
 * The proxy worker applies `userWorkerInnerUrlOverrides` — computed from
 * `dev.upstream_protocol` — to every request it forwards. In a multiworker
 * session those overrides come from whichever worker's bundle completes the
 * set last, so an unrelated worker's config can override the protocol a
 * routed worker sees in `request.url` and rewritten headers like `Origin`
 * (see #16268).
 *
 * This test makes the bundle order deterministic: the primary worker is a
 * small routed worker with `dev.upstream_protocol: "https"`, and an
 * unrelated worker without any `dev` settings deliberately bundles last by
 * importing a large generated module.
 */
describe("createTestHarness multiworker request protocol", () => {
	mockConsoleMethods();
	runInTempDir();

	it("applies the routed worker's upstream_protocol regardless of which worker bundles last", async ({
		expect,
	}) => {
		writeFileSync(
			"echo.js",
			`export default {
				fetch(request) {
					return Response.json({
						url: request.url,
						origin: request.headers.get("origin"),
					});
				}
			};`
		);

		// Make this worker's bundle reliably complete after the routed
		// worker's, the way a larger project would in #16268.
		let big = "export const big = [\n";
		for (let i = 0; i < 200_000; i++) {
			big += `{a:${i},b:"x${i}",c:function(){return ${i}*2}},\n`;
		}
		big += "];\n";
		writeFileSync("big.js", big);
		writeFileSync(
			"slow.js",
			`import { big } from "./big.js";
			export default {
				fetch() {
					return new Response(String(big.length));
				}
			};`
		);

		const server = createTestHarness({
			workers: [
				{
					config: {
						name: "echo",
						main: "echo.js",
						compatibility_date: "2026-05-20",
						routes: ["app.example.com/api/*"],
						dev: { upstream_protocol: "https" },
					},
				},
				{
					config: {
						name: "other",
						main: "slow.js",
						compatibility_date: "2026-05-20",
					},
				},
			],
		});
		onTestFinished(() => server.close());

		await server.listen();

		// The unrelated worker must have bundled (last) for this test to
		// exercise the reported race.
		const otherResponse = await server.getWorker("other").fetch("/");
		await expect(otherResponse.text()).resolves.toBe("200000");

		const response = await server.fetch("https://app.example.com/api/x", {
			headers: { origin: "https://app.example.com" },
		});
		await expect(response.json()).resolves.toEqual({
			url: "https://app.example.com/api/x",
			origin: "https://app.example.com",
		});
	});
});
