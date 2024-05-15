export async function processJob(env: Env, job: QueueJob) {
	const result = job.value.toUpperCase();
	await env.QUEUE_RESULTS.put(job.key, result);
}

export default {
	async fetch(request, env, ctx) {
		const { pathname } = new URL(request.url);
		if (request.method === "GET") {
			const value = await env.QUEUE_RESULTS.get(pathname, "stream");
			return new Response(value, { status: value === null ? 404 : 200 });
		} else if (request.method === "POST") {
			const value = await request.text();
			await env.QUEUE_PRODUCER.send({ key: pathname, value });
			return new Response("Accepted", { status: 202 });
		} else {
			return new Response("Method Not Allowed", { status: 405 });
		}
	},
	async queue(batch, env, ctx) {
		for (const message of batch.messages) {
			await processJob(env, message.body);
			message.ack();
		}
	},
} satisfies ExportedHandler<Env, QueueJob>;
// ^ Using `satisfies` provides type checking/completions for `ExportedHandler`
//   whilst still allowing us to call `worker.fetch()` and `worker.queue()` in
//   tests without asserting they're defined.
