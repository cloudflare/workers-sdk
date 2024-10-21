import {
	WorkerEntrypoint,
	WorkflowEntrypoint,
	WorkflowEvent,
	WorkflowStep,
} from "cloudflare:workers";

type Params = {
	name: string;
};
export class Demo extends WorkflowEntrypoint<{}, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
		const { timestamp, payload } = event;
		const result = await step.do("First step", async function () {
			return {
				output: "First step result",
			};
		});

		await step.sleep("Wait", "1 minute");

		const result2 = await step.do("Second step", async function () {
			return {
				output: "Second step result",
			};
		});

		return {
			result,
			result2,
			timestamp,
			payload,
		};
	}
}

type Env = {
	WORKFLOW: Workflow;
};
export default class extends WorkerEntrypoint<Env> {
	async fetch() {
		const handle = await this.env.WORKFLOW.create({
			name: crypto.randomUUID(),
		});
		// await handle.pause();
		return Response.json(await handle.status());
	}
}
