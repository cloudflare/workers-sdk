import http from "node:http";
import path from "node:path";
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
			const server = http.createServer((req, res) => {
				res.writeHead(200);
				res.end(
					req.headers["cf-connecting-ip"] ?? "CF-Connecting-IP header stripped"
				);
			});

			t.onTestFinished(() => {
				server.close();
			});

			const address = server.listen(0).address();

			if (address === null || typeof address === "string") {
				expect.fail("Failed to get server address");
			}

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
			});

			t.onTestFinished(() => worker.dispose());

			const response = await worker.fetch(`http://127.0.0.1:${address.port}`);
			await expect(response.text()).resolves.toEqual(
				"CF-Connecting-IP header stripped"
			);
		}
	);
});
