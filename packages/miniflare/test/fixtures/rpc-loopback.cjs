const assert = require("node:assert/strict");
const { Miniflare, Log, LogLevel } = require(process.env.MINIFLARE_PATH);

async function main() {
	const options = {
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
	};
	const miniflare = new Miniflare(options);
	try {
		const worker = await miniflare.getWorker("rpc-worker");
		process.stdout.write("calling RPC\n");
		const result = worker.startWorkflow();
		assert.equal(typeof result, "string");
		assert.match(result, /^[0-9a-f-]{36}$/);
		assert.equal(worker.startWorkflow("rpc-instance"), "rpc-instance");
		assert.equal(worker.deleteWorkflow("rpc-instance"), undefined);
		assert.equal(worker.startWorkflow("rpc-instance"), "rpc-instance");
		await miniflare.setOptions(options);
		assert.throws(
			() => worker.startWorkflow(),
			/Attempted to use poisoned stub/
		);
		const replacement = await miniflare.getWorker("rpc-worker");
		assert.equal(replacement.startWorkflow("after-reload"), "after-reload");
		process.stdout.write("RPC completed\n");
	} finally {
		await miniflare.dispose();
	}
}

main().catch((error) => {
	process.stderr.write(`${error.stack}\n`);
	process.exitCode = 1;
});
