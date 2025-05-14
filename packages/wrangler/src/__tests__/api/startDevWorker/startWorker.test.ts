import path from "node:path";
import { Response } from "miniflare";
import dedent from "ts-dedent";
import { startWorker } from "../../../api/startDevWorker";
import { runInTempDir } from "../../helpers/run-in-tmp";
import { seed } from "../../helpers/seed";

describe("startWorker", () => {
	runInTempDir();

	// We do not inject the `CF-Connecting-IP` header on Windows at the moment.
	// See https://github.com/cloudflare/workerd/issues/3310
	it.skipIf(process.platform === "win32")(
		"strips the CF-Connecting-IP header from all outbound requests",
		async (t) => {
			t.onTestFinished(() => worker?.dispose());

			await seed({
				"src/index.ts": dedent`
					export default {
						fetch(request) {
							if (request.headers.has('CF-Connecting-IP')) {
								return fetch(request);
							}

							return new Response("No CF-Connecting-IP header");
						}
					}
				`,
			});

			const worker = await startWorker({
				name: "test-worker",
				entrypoint: path.resolve("src/index.ts"),
				dev: {
					outboundService(request) {
						return new Response(
							request.headers.get("CF-Connecting-IP") ??
								"CF-Connecting-IP header stripped"
						);
					},
				},
			});

			const response = await worker.fetch("http://example.com");
			await expect(response.text()).resolves.toEqual(
				"CF-Connecting-IP header stripped"
			);
		}
	);
});
