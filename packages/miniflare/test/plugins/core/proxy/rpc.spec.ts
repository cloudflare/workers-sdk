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

test.for(["callNode", "startWorkflow"])(
	"first RPC call to %s can wait for Node loopback",
	async (method, { expect }) => {
		const { stdout } = await promisify(execFile)(
			process.execPath,
			[path.join(FIXTURES_PATH, "rpc-loopback.cjs"), method],
			{
				env: { ...process.env, MINIFLARE_PATH: require.resolve("miniflare") },
				timeout: 20_000,
				killSignal: "SIGKILL",
			}
		);
		expect(stdout).toBe("calling RPC\nRPC completed\n");
	}
);

test("preserves RPC results and rejections through the promise bridge", async ({
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
		echo(value: unknown): Promise<unknown>;
		fail(): Promise<never>;
		reject(): Promise<never>;
		stream(): Promise<ReadableStream<Uint8Array>>;
		target(): Promise<{ value: string; getValue(): Promise<string> }>;
		nestedCallable(): Promise<() => () => string>;
	}
	const worker = (await miniflare.getWorker(
		"rpc-worker"
	)) as unknown as RpcWorker;

	for (const value of [undefined, null, "value", 123, { value: [1, 2] }]) {
		const result = worker.echo(value);
		expect(result).toBeInstanceOf(Promise);
		await expect(result).resolves.toEqual(value);
	}

	for (let invocation = 0; invocation < 2; invocation++) {
		await expect(worker.fail()).rejects.toThrow("rpc failure");
		await expect(worker.reject()).rejects.toThrow("rpc rejection");
		expect(await text(await worker.stream())).toBe("stream body");
		const target = await worker.target();
		expect(target.value).toBe("target value");
		await expect(target.getValue()).resolves.toBe("target value");
		const outer = await worker.nestedCallable();
		for (let call = 0; call < 2; call++) {
			const inner = outer();
			expect(inner()).toBe("nested function value");
			expect(inner()).toBe("nested function value");
		}
	}
});
