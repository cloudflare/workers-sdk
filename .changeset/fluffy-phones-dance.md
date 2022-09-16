---
"wrangler": patch
---

feat: multi-worker testing

This change introduces the ability to test multi-worker setups via the wrangler API's [unstable_dev](https://developers.cloudflare.com/workers/wrangler/api/#unstable_dev) function.

Usage:

```js
import { unstable_dev } from "wrangler";

/**
 * Note: if you shut down the first worker you spun up,
 * the parent worker won't know the child worker exists
 * and your tests will fail
 */
describe("multi-worker testing", () => {
	let childWorker;
	let parentWorker;

	beforeAll(async () => {
		childWorker = await unstable_dev(
			"src/child-worker.js",
			{ config: "src/child-wrangler.toml" },
			{ disableExperimentalWarning: true }
		);
		parentWorker = await unstable_dev(
			"src/parent-worker.js",
			{ config: "src/parent-wrangler.toml" },
			{ disableExperimentalWarning: true }
		);
	});

	afterAll(async () => {
		await childWorker.stop();
		await parentWorker.stop();
	});

	it("childWorker should return Hello World itself", async () => {
		const resp = await childWorker.fetch();
		if (resp) {
			const text = await resp.text();
			expect(text).toMatchInlineSnapshot(`"Hello World!"`);
		}
	});

	it("parentWorker should return Hello World by invoking the child worker", async () => {
		const resp = await parentWorker.fetch();
		if (resp) {
			const parsedResp = await resp.text();
			expect(parsedResp).toEqual("Parent worker sees: Hello World!");
		}
	});
});
```
