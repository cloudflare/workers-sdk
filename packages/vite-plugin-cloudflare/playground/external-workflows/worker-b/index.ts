import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";

export class MyWorkflow extends WorkflowEntrypoint {
	override async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
		await step.do("first step", async () => {
			return {
				output: "First step result",
			};
		});

		await step.sleep("sleep", "1 second");

		await step.do("second step", async () => {
			return {
				output: "Second step result",
			};
		});

		return "Workflow output";
	}
}
