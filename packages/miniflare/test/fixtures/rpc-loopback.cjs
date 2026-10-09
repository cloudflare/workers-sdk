const assert = require("node:assert/strict");
const { Miniflare, Log, LogLevel, Response } = require(
	process.env.MINIFLARE_PATH
);

async function main() {
	const miniflare = new Miniflare({
		log: new Log(LogLevel.ERROR),
		workers: [
			{
				config: {
					name: "rpc-worker",
					compatibilityDate: "2026-03-11",
					manifest: {
						mainModule: "index.mjs",
						modules: {
							"index.mjs": {
								type: "esm",
								contents: `
import { WorkerEntrypoint, WorkflowEntrypoint } from "cloudflare:workers";

export class MyWorkflow extends WorkflowEntrypoint {
	async run() {
		return "done";
	}
}

export default class Api extends WorkerEntrypoint {
	async callNode() {
		const response = await this.env.NODE_CALLBACK.fetch("http://placeholder/");
		return response.text();
	}

	async startWorkflow(id) {
		const instance = await this.env.MY_WORKFLOW.create({ id });
		return instance.id;
	}

	async deleteWorkflow(id) {
		const instance = await this.env.MY_WORKFLOW.get(id);
		await instance.delete();
	}
}
`,
							},
						},
					},
					env: {
						NODE_CALLBACK: {
							type: "fetcher",
							handler() {
								return new Response("callback");
							},
						},
						MY_WORKFLOW: {
							type: "workflow",
							name: "my-workflow",
							worker: "rpc-worker",
							exportName: "MyWorkflow",
						},
					},
				},
			},
		],
	});
	try {
		const worker = await miniflare.getWorker("rpc-worker");
		const method = process.argv[2];
		assert(method === "callNode" || method === "startWorkflow");
		process.stdout.write("calling RPC\n");
		const firstCall = worker[method]();
		assert(firstCall instanceof Promise);
		const result = await firstCall;
		if (method === "callNode") {
			assert.equal(result, "callback");
			assert.equal(await worker.callNode(), "callback");
		} else {
			assert.match(result, /^[0-9a-f-]{36}$/);
			assert.equal(await worker.startWorkflow("rpc-instance"), "rpc-instance");
			await worker.deleteWorkflow("rpc-instance");
			assert.equal(await worker.startWorkflow("rpc-instance"), "rpc-instance");
		}
		process.stdout.write("RPC completed\n");
	} finally {
		await miniflare.dispose();
	}
}

main().catch((error) => {
	process.stderr.write(`${error.stack}\n`);
	process.exitCode = 1;
});
