import { getWorkerBResponses } from "./workerB.util";
import { getWorkerCResponses } from "./workerC.util";
import { getWorkerDResponses } from "./workerD.util";

export default {
	async fetch(request, env) {
		const workerBResponses = await getWorkerBResponses(request, env);
		const workerCResponses = await getWorkerCResponses(request, env);
		const workerDResponses = await getWorkerDResponses(request, env);

		// let's return everything for now to make testing easier
		return new Response(
			`"worker-b" Responses\n` +
				`env.DEFAULT_EXPORT.fetch() response: ${workerBResponses.fetchResponse}\n` +
				`env.DEFAULT_EXPORT.bee() response: ${workerBResponses.beeResult}\n` +
				`env.DEFAULT_EXPORT.busyBee("🐝") response: ${workerBResponses.busyBeeResult}\n` +
				`env.DEFAULT_EXPORT.scheduled() response: ${workerBResponses.scheduledResponse}\n\n` +
				`"worker-c" Responses\n` +
				`env.DEFAULT_ENTRYPOINT.fetch() response: ${workerCResponses.fetchResponse}\n` +
				`env.DEFAULT_ENTRYPOINT.bee() response: ${workerCResponses.beeResult}\n` +
				`env.DEFAULT_ENTRYPOINT.busyBee("🐝") response: ${workerCResponses.busyBeeResult}\n` +
				`env.DEFAULT_ENTRYPOINT.scheduled() response: ${workerCResponses.scheduledResponse}\n\n` +
				`"worker-d" Responses\n` +
				`env.NAMED_ENTRYPOINT.fetch() response: ${workerDResponses.fetchResponse}\n` +
				`env.NAMED_ENTRYPOINT.bee() response: ${workerDResponses.beeResult}\n` +
				`env.NAMED_ENTRYPOINT.busyBee("🐝") response: ${workerDResponses.busyBeeResult}\n` +
				`env.NAMED_ENTRYPOINT.scheduled() response: ${workerDResponses.scheduledResponse}\n\n`
		);
	},
};
