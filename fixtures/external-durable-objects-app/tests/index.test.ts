import * as path from "path";
import { setTimeout } from "timers/promises";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unstable_dev } from "wrangler";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";
import type { UnstableDevWorker } from "wrangler";

// TODO: reenable when https://github.com/cloudflare/workers-sdk/pull/4241 lands
// and improves reliability of this test.
describe.skip(
	"Pages Functions",
	() => {
		let a: UnstableDevWorker;
		let b: UnstableDevWorker;
		let c: UnstableDevWorker;
		let d: Awaited<ReturnType<typeof runWranglerPagesDev>>;

		beforeAll(async () => {
			a = await unstable_dev(path.join(__dirname, "../a/index.ts"), {
				config: path.join(__dirname, "../a/wrangler.toml"),
				experimental: {
					disableExperimentalWarning: true,
					devEnv: true,
					fileBasedRegistry: true,
				},
			});
			await setTimeout(1000);
			b = await unstable_dev(path.join(__dirname, "../b/index.ts"), {
				config: path.join(__dirname, "../b/wrangler.toml"),
				experimental: {
					disableExperimentalWarning: true,
					devEnv: true,
					fileBasedRegistry: true,
				},
			});
			await setTimeout(1000);
			c = await unstable_dev(path.join(__dirname, "../c/index.ts"), {
				config: path.join(__dirname, "../c/wrangler.toml"),
				experimental: {
					disableExperimentalWarning: true,
					devEnv: true,
					fileBasedRegistry: true,
				},
			});
			await setTimeout(1000);

			d = await runWranglerPagesDev(
				path.resolve(__dirname, "..", "d"),
				"public",
				[
					"--compatibility-date=2024-03-04",
					"--do=PAGES_REFERENCED_DO=MyDurableObject@a",
					"--port=0",
				]
			);
		});

		afterAll(async () => {
			await a.stop();
			await b.stop();
			await c.stop();
			await d.stop();
		});

		it("connects up Durable Objects and keeps state across wrangler instances", async () => {
			await setTimeout(1000);

			const responseA = await a.fetch(`/`, {
				headers: {
					"X-Reset-Count": "true",
				},
			});
			const dataA = (await responseA.json()) as { count: number; id: string };
			expect(dataA.count).toEqual(1);
			const responseB = await b.fetch(`/`);
			const dataB = (await responseB.json()) as { count: number; id: string };
			expect(dataB.count).toEqual(2);
			const responseC = await c.fetch(`/`);
			const dataC = (await responseC.json()) as { count: number; id: string };
			expect(dataC.count).toEqual(3);
			const responseD = await fetch(`http://${d.ip}:${d.port}/`);
			const dataD = (await responseD.json()) as { count: number; id: string };
			expect(dataD.count).toEqual(4);
			const responseA2 = await a.fetch(`/`);
			const dataA2 = (await responseA2.json()) as { count: number; id: string };
			expect(dataA2.count).toEqual(5);
			expect(dataA.id).toEqual(dataB.id);
			expect(dataA.id).toEqual(dataC.id);
			expect(dataA.id).toEqual(dataA2.id);
		});
	},
	{ retry: 2 }
);
