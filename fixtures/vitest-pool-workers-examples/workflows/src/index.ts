import {
	WorkflowEntrypoint,
	WorkflowEvent,
	WorkflowStep,
} from "cloudflare:workers";

export class ModeratorWorkflow extends WorkflowEntrypoint<Env> {
	async run(_event: Readonly<WorkflowEvent<unknown>>, step: WorkflowStep) {
		await step.sleep("sleep for a while", "10 seconds");

		// Get an initial analysis from an AI model
		const aiResult = await step.do("AI content scan", async () => {
			// Call to an workers-ai to scan the text content and return a violation score

			// Simulated score:
			const violationScore = Math.floor(Math.random() * 100);

			return { violationScore: violationScore };
		});

		// Triage based on the AI score
		if (aiResult.violationScore < 10) {
			await step.do("auto approve content", async () => {
				// API call to set app content status to "approved"
				return { status: "auto_approved" };
			});
			return { status: "auto_approved" };
		}
		if (aiResult.violationScore > 90) {
			await step.do("auto reject content", async () => {
				// API call to set app content status to "rejected"
				return { status: "auto_rejected" };
			});
			return { status: "auto_rejected" };
		}

		// If the score is ambiguous, require human review
		type EventPayload = {
			moderatorAction: string;
		};
		const eventPayload = await step.waitForEvent<EventPayload>("human review", {
			type: "moderation-decision",
			timeout: "1 day",
		});

		if (eventPayload) {
			// The moderator responded in time.
			const decision = eventPayload.payload.moderatorAction; // e.g., "approve" or "reject"
			await step.do("apply moderator decision", async () => {
				// API call to update content status based on the decision
				return { status: "moderated", decision: decision };
			});
			return { status: "moderated", decision: decision };
		}
	}
}

export default {
	async fetch(request: Request, env: Env) {
		const url = new URL(request.url);
		const maybeId = url.searchParams.get("id");
		if (maybeId !== null) {
			const instance = await env.MODERATOR.get(maybeId);

			return Response.json(await instance.status());
		}

		if (url.pathname === "/moderate") {
			const workflow = await env.MODERATOR.create();
			return Response.json({
				id: workflow.id,
				details: await workflow.status(),
			});
		}

		if (url.pathname === "/moderate-batch") {
			const workflows = await env.MODERATOR.createBatch([
				{},
				{ id: "321" },
				{},
			]);

			const ids = workflows.map((workflow) => workflow.id);
			return Response.json({ ids: ids });
		}

		return new Response("Not found", { status: 404 });
	},
};
