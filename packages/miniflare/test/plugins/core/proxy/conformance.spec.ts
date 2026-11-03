import fs from "node:fs/promises";
import path from "node:path";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, test } from "vitest";
import {
	describe as describeValue,
	scenarios,
} from "./conformance-scenarios.mjs";
import type { MiniflareOptions } from "miniflare";

// Runs each scenario inside a Worker, and in Node.js through the API proxy,
// then compares the results, so the proxy can't drift from `workerd`
const WORKER_SCRIPT = `
import { DurableObject, RpcTarget, WorkerEntrypoint, WorkflowEntrypoint } from "cloudflare:workers";
import { describe, scenarios } from "./scenarios.mjs";

class CustomError extends Error {
	name = "CustomError";
	constructor(message) {
		super(message, { cause: new TypeError("cause") });
		this.code = 42;
	}
}
class Counter extends RpcTarget {
	#count = 0;
	increment() { return ++this.#count; }
}

export class TestObject extends DurableObject {
	echo(value) { return value; }
	fail() { throw new CustomError("object failure"); }
	fetch(request) { return new Response(\`\${this.ctx.id} \${request.url}\`); }
	set(value) { this.value = value; }
	get() { return this.value; }
	remember(fn) { this.fn = fn.dup(); }
	callRemembered() { return this.fn("later"); }
}
export class TestEntrypoint extends WorkerEntrypoint {
	get property() { return "value"; }
	echo(value) { return value; }
	getCounter() { return new Counter(); }
	increment(counter) { return counter.increment(); }
	callback(fn) { return fn("arg"); }
	async callbackError(fn) {
		try {
			await fn();
		} catch (e) {
			// \`workerd\` adds \`durableObjectId\` to errors passing through Durable
			// Objects, such as \`ProxyServer\`
			const keys = Object.keys(e).filter((key) => key !== "durableObjectId");
			return { name: e.name, message: e.message, keys };
		}
	}
	fail() { throw new CustomError("service failure"); }
}
export class TestWorkflow extends WorkflowEntrypoint {
	async run() {}
}

export default {
	async fetch(request, env) {
		const name = new URL(request.url).searchParams.get("scenario");
		try {
			return Response.json({ value: await describe(await scenarios[name](env, caches)) });
		} catch (e) {
			return Response.json({ error: await describe(e) });
		}
	},
};
`;

async function getOptions(): Promise<MiniflareOptions> {
	const scenariosScript = await fs.readFile(
		path.join(__dirname, "conformance-scenarios.mjs"),
		"utf8"
	);
	return {
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-05-01",
					compatibilityFlags: ["enhanced_error_serialization"],
					manifest: {
						mainModule: "index.mjs",
						modulesRoot: process.cwd(),
						modules: {
							"index.mjs": { type: "esm", contents: WORKER_SCRIPT },
							"scenarios.mjs": { type: "esm", contents: scenariosScript },
						},
					},
					env: {
						KV: { type: "kv", id: "kv" },
						R2: { type: "r2", name: "r2" },
						DB: { type: "d1", id: "db" },
						OBJECT: {
							type: "durable-object",
							worker: "",
							exportName: "TestObject",
						},
						SERVICE: {
							type: "worker",
							worker: "",
							exportName: "TestEntrypoint",
						},
						QUEUE: { type: "queue", name: "queue" },
						RATE_LIMIT: {
							type: "rate-limit",
							namespace: "1",
							simple: { limit: 1, period: 60 },
						},
						WORKFLOW: {
							type: "workflow",
							name: "WORKFLOW",
							worker: "",
							exportName: "TestWorkflow",
						},
						ANALYTICS: { type: "analytics-engine-dataset" },
						IMAGES: { type: "images" },
					},
					exports: {
						TestObject: { type: "durable-object", storage: "sqlite" },
					},
				},
			},
		],
	};
}

describe("API proxy matches workerd", () => {
	// Separate instances, so each scenario starts with the same storage
	let workerMf: Miniflare;
	let nodeMf: Miniflare;
	beforeAll(async () => {
		const options = await getOptions();
		workerMf = new Miniflare(options);
		nodeMf = new Miniflare(options);
	});
	afterAll(() => Promise.all([workerMf?.dispose(), nodeMf?.dispose()]));

	test.for(Object.keys(scenarios) as (keyof typeof scenarios)[])(
		"%s",
		async (name, { expect }) => {
			const res = await workerMf.dispatchFetch(
				`http://localhost/?scenario=${name}`
			);
			const expected = await res.json();

			const env = await nodeMf.getBindings();
			const caches = await nodeMf.getCaches();
			let actual: unknown;
			try {
				actual = {
					value: await describeValue(await scenarios[name](env, caches)),
				};
			} catch (e) {
				actual = { error: await describeValue(e) };
			}
			expect(actual).toEqual(expected);
		}
	);
});
