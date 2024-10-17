import {
	WorkerEntrypoint,
	Workflow,
	WorkflowEvent,
	WorkflowStep,
} from "cloudflare:workers";

type Params = {
	name: string;
};
export class Demo extends Workflow<{}, Params> {
	async run(events: Array<WorkflowEvent<Params>>, step: WorkflowStep) {
		const { timestamp, payload } = events[0];
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
	WORKFLOW: {
		create: (id: string) => {
			pause: () => {};
		};
	};
};
export default class extends WorkerEntrypoint<Env> {
	async fetch() {
		const handle = await this.env.WORKFLOW.create(crypto.randomUUID());
		await handle.pause();
		return new Response();
	}
}
