export const onRequestPost: ({ request: Request, env: Env }) => Promise<Response> = async ({
	request,
	env,
}) => {
	try {
		const input = await request.json();
		const uuid = crypto.randomUUID();
		const pretty = JSON.stringify({ uuid, ...input }, null, 2);
		// Add the comment to the KV store called comment_db
		await env.comment_db.put(uuid, pretty, {
			metadata: { createdAt: Date.now() },
		});
		return new Response(pretty, {
			headers: {
				'Content-Type': 'application/json;charset=utf-8',
			},
		});
	} catch (err: any) {
		return new Response('Error parsing JSON content', {
			status: 400,
		});
	}
};
