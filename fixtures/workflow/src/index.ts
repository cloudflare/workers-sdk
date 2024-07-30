import { WorkerEntrypoint } from "cloudflare:workers";

export default class extends WorkerEntrypoint {
	async init(event: any, step: any): Promise<void> {
		await step.run("first step", async function () {
			await fetch(
				`https://webhook.site/16ffb499-32d1-4a0b-b2fd-ad8b15114f30?step=first`
			);
			return {
				result: "ok",
			};
		});

		await step.sleep("10 seconds");

		await step.run("second step", async function () {
			await fetch(
				`https://webhook.site/16ffb499-32d1-4a0b-b2fd-ad8b15114f30?step=second`
			);
			return {
				result: "ok",
			};
		});
	}
	async fetch(): Promise<Response> {
		return new Response();
	}
}
