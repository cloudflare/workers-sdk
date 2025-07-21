import playwrightWorker from "./playwright";
import puppeteerWorker from "./puppeteer";

export default {
	async fetch(request, env): Promise<Response> {
		const { searchParams } = new URL(request.url);
		let lib = searchParams.get("lib");

		if (lib === "playwright") {
			return playwrightWorker.fetch(request, env);
		} else {
			return puppeteerWorker.fetch(request, env);
		}
	},
} satisfies ExportedHandler<Env>;
