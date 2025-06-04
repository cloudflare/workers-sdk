import { getWorkerBResponses } from "./workerB.util";
import { getWorkerCResponses } from "./workerC.util";
import { getWorkerDResponses } from "./workerD.util";
import { getWorkerWSResponses } from "./workerWS.util";

export default {
	async fetch(request, env) {
		const workerBResponses = await getWorkerBResponses(request, env);
		const workerCResponses = await getWorkerCResponses(request, env);
		const workerDResponses = await getWorkerDResponses(request, env);
		const workerWSResponses = await getWorkerWSResponses(request, env);

		// let's return everything for now to make testing easier
		return new Response(
			`"worker-b" Responses\n` +
				`env.DEFAULT_EXPORT.fetch() response: ${workerBResponses.fetchResponse}\n` +
				`env.DEFAULT_EXPORT.bee() response: ${workerBResponses.beeResult}\n` +
				`env.DEFAULT_EXPORT.busyBee("🐝") response: ${workerBResponses.busyBeeResult}\n` +
				`env.DEFAULT_EXPORT.honey response: ${workerBResponses.honeyResponse}\n` +
				`env.DEFAULT_EXPORT.honeyBee response: ${workerBResponses.honeyBeeResponse}\n` +
				`env.DEFAULT_EXPORT.foo("✨").bar.buzz() response: ${workerBResponses.buzzResult}\n` +
				`env.DEFAULT_EXPORT.newBeeCounter().value response: ${workerBResponses.beeCountResult}\n` +
				`env.DEFAULT_EXPORT.scheduled() response: ${workerBResponses.scheduledResponse}\n\n` +
				`"worker-c" Responses\n` +
				`env.DEFAULT_ENTRYPOINT.fetch() response: ${workerCResponses.fetchResponse}\n` +
				`env.DEFAULT_ENTRYPOINT.bee() response: ${workerCResponses.beeResult}\n` +
				`env.DEFAULT_ENTRYPOINT.busyBee("🐝") response: ${workerCResponses.busyBeeResult}\n` +
				`env.DEFAULT_ENTRYPOINT.honey response: ${workerCResponses.honeyResponse}\n` +
				`env.DEFAULT_ENTRYPOINT.honeyBee response: ${workerCResponses.honeyBeeResponse}\n` +
				`env.DEFAULT_ENTRYPOINT.foo("🐜").bar.buzz() response: ${workerCResponses.buzzResult}\n` +
				`env.DEFAULT_ENTRYPOINT.newBeeCounter().value response: ${workerCResponses.beeCountResult}\n` +
				`env.DEFAULT_ENTRYPOINT.scheduled() response: ${workerCResponses.scheduledResponse}\n\n` +
				`"worker-d" Responses\n` +
				`env.NAMED_ENTRYPOINT.fetch() response: ${workerDResponses.fetchResponse}\n` +
				`env.NAMED_ENTRYPOINT.bee() response: ${workerDResponses.beeResult}\n` +
				`env.NAMED_ENTRYPOINT.busyBee("🐝") response: ${workerDResponses.busyBeeResult}\n` +
				`env.NAMED_ENTRYPOINT.honey response: ${workerDResponses.honeyResponse}\n` +
				`env.NAMED_ENTRYPOINT.honeyBee response: ${workerDResponses.honeyBeeResponse}\n` +
				`env.NAMED_ENTRYPOINT.foo("🐙").bar.buzz() response: ${workerDResponses.buzzResult}\n` +
				`env.NAMED_ENTRYPOINT.newBeeCounter().value response: ${workerDResponses.beeCountResult}\n` +
				`env.NAMED_ENTRYPOINT.scheduled() response: ${workerDResponses.scheduledResponse}\n` +
				`"worker-ws" Responses\n` +
				`env.WS.fetch() response: ${workerWSResponses.fetchResponse}\n`
		);
	},
};
