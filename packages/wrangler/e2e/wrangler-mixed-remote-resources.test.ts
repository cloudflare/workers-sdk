import path from "node:path";
import { describe, expect, test } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { fetchText } from "./helpers/fetch-text";

describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)(
	"Wrangler Mixed Remote resources E2E Tests",
	() => {
		test("the same KV (with the same id) can be used in the same dev session both in local and remote mode", async () => {
			const helper = new WranglerE2ETestHelper();
			await helper.seed(
				path.resolve(__dirname, "./seed-files/remote-binding-workers")
			);

			const kvId = await helper.kv(false);
			await helper.run(
				`wrangler kv key put --remote --namespace-id=${kvId} test-key remote-value`
			);
			await helper.run(
				`wrangler kv key put --namespace-id=${kvId} test-key local-value`
			);

			await helper.seed({
				"wrangler.json": JSON.stringify(
					{
						name: "mixed-remote-bindings-test",
						main: "mixed-kvs.js",
						compatibility_date: "2025-01-01",
						kv_namespaces: [
							{
								binding: "KV_LOCAL_BINDING",
								id: kvId,
							},
							{
								binding: "KV_REMOTE_BINDING",
								id: kvId,
								experimental_remote: true,
							},
						],
					},
					null,
					2
				),
			});

			const worker = helper.runLongLived("wrangler dev --x-remote-bindings", {
				stopOnTestFinished: false,
			});

			const { url } = await worker.waitForReady();

			const response = await fetchText(url);
			expect(response).toMatchInlineSnapshot(`
				"The kv local value is: local-value
				The kv remote value is remote-value"
			`);

			await worker.stop();
		});
	}
);
