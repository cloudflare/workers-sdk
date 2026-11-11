import { Miniflare } from "miniflare";
import { test } from "vitest";
import { singleModuleManifest, useDispose } from "../../../test-shared";

// https://github.com/cloudflare/workers-sdk/issues/8510
test("supports calling methods on RpcTargets returned from entrypoint getters", async ({
	expect,
}) => {
	const mf = new Miniflare({
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-05-01",
					env: {
						WORKER_A: { type: "worker", worker: "a", exportName: "WorkerA" },
					},
				},
				legacy: {
					serviceWorkerScript:
						'addEventListener("fetch", (e) => e.respondWith(new Response(null)));',
				},
			},
			{
				config: {
					name: "a",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(`
						import { RpcTarget, WorkerEntrypoint } from "cloudflare:workers";
						class FooTarget extends RpcTarget {
							async getFoo() { return "foo"; }
						}
						export class WorkerA extends WorkerEntrypoint {
							get foo() { return new FooTarget(); }
							getBar() { return "bar"; }
						}
						export default { fetch() { return new Response(null); } };
					`),
				},
			},
		],
	});
	useDispose(mf);

	const { WORKER_A } = await mf.getBindings<{ WORKER_A: any }>();
	expect(await WORKER_A.getBar()).toBe("bar");
	expect(await WORKER_A.foo.getFoo()).toBe("foo");
});
