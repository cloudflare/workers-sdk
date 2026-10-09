import { execFile } from "node:child_process";
import path from "node:path";
import { text } from "node:stream/consumers";
import { promisify } from "node:util";
import { Miniflare } from "miniflare";
import { test } from "vitest";
import {
	FIXTURES_PATH,
	singleModuleManifest,
	useDispose,
} from "../../../test-shared";
import type { MiniflareOptions } from "miniflare";

test.for(["secrets-store", "flagship"])(
	"preserves synchronous %s admin factories across runtime invalidation",
	async (bindingType, { expect }) => {
		const options: MiniflareOptions = {
			workers: [
				{
					config: {
						name: "",
						compatibilityDate: "2025-01-01",
						manifest: singleModuleManifest(
							`export default { fetch() { return new Response("ok"); } }`
						),
						env: {
							SECRET: {
								type: "secrets-store-secret",
								storeId: "factory-test",
								secretName: "secret",
							},
							FLAGS: { type: "flagship", id: "factory-test" },
						},
					},
				},
			],
		};
		const miniflare = new Miniflare(options);
		useDispose(miniflare);
		function getFactory() {
			return bindingType === "secrets-store"
				? miniflare.getSecretsStoreSecretAPI("SECRET")
				: miniflare.getFlagshipBindingAPI("FLAGS");
		}

		const factory = await getFactory();
		expect(await getFactory()).toBe(factory);
		const firstAdmin = factory();
		expect(firstAdmin).not.toBeInstanceOf(Promise);
		const secondAdmin = factory();
		expect(secondAdmin).not.toBeInstanceOf(Promise);
		expect(secondAdmin).not.toBe(firstAdmin);

		await miniflare.setOptions(options);
		expect(() => factory()).toThrow("Attempted to use poisoned stub");
		expect(() => Object.keys(firstAdmin)).toThrow(
			"Attempted to use poisoned stub"
		);

		const replacementFactory = await getFactory();
		expect(replacementFactory).not.toBe(factory);
		expect(await getFactory()).toBe(replacementFactory);
		await miniflare.dispose();
		expect(() => replacementFactory()).toThrow(
			"Attempted to use poisoned stub"
		);
	}
);

test("first synchronous RPC call can create, delete and recreate a Workflow", async ({
	expect,
}) => {
	const { stdout } = await promisify(execFile)(
		process.execPath,
		[path.join(FIXTURES_PATH, "rpc-loopback.cjs")],
		{
			env: { ...process.env, MINIFLARE_PATH: require.resolve("miniflare") },
			timeout: 20_000,
			killSignal: "SIGKILL",
		}
	);
	expect(stdout).toBe("calling RPC\nRPC completed\n");
});

test("preserves synchronous RPC results, errors and arbitrary factories", async ({
	expect,
}) => {
	const miniflare = new Miniflare({
		workers: [
			{
				config: {
					name: "rpc-worker",
					compatibilityDate: "2026-03-11",
					manifest: singleModuleManifest(`
import { WorkerEntrypoint, RpcTarget } from "cloudflare:workers";

class ResultTarget extends RpcTarget {
	get value() { return "target value"; }
	getValue() { return this.value; }
}

export default class Api extends WorkerEntrypoint {
	echo(value) { return value; }
	fail() { throw new Error("rpc failure"); }
	async reject() {
		await Promise.resolve();
		throw new Error("rpc rejection");
	}
	stream() { return new Response("stream body").body; }
	target() { return new ResultTarget(); }
	nestedCallable() { return () => () => "nested function value"; }
}
`),
				},
			},
		],
	});
	useDispose(miniflare);

	interface RpcWorker {
		echo(value: unknown): unknown;
		fail(): never;
		reject(): never;
		stream(): ReadableStream<Uint8Array>;
		target(): { value: string; getValue(): string };
		nestedCallable(): () => () => string;
	}
	const worker = (await miniflare.getWorker(
		"rpc-worker"
	)) as unknown as RpcWorker;

	for (const value of [undefined, null, "value", 123, { value: [1, 2] }]) {
		const result = worker.echo(value);
		expect(result).not.toBeInstanceOf(Promise);
		expect(result).toEqual(value);
	}

	for (let invocation = 0; invocation < 2; invocation++) {
		expect(() => worker.fail()).toThrow("rpc failure");
		expect(() => worker.reject()).toThrow("rpc rejection");
		expect(await text(worker.stream())).toBe("stream body");
		const target = worker.target();
		expect(target.value).toBe("target value");
		expect(target.getValue()).toBe("target value");
		const outer = worker.nestedCallable();
		for (let call = 0; call < 2; call++) {
			const inner = outer();
			expect(inner()).toBe("nested function value");
			expect(inner()).toBe("nested function value");
		}
	}
});
