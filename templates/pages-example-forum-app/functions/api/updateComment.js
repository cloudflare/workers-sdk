export async function onRequestPost({ request, env }) {
	try {
		const input = await request.json();
		const pretty = JSON.stringify(input, null, 2);

		await env.comment_db.put(input.uuid, pretty, {
			metadata: { createdAt: Date.now() },
		});
		return new Response(pretty, {
			headers: {
				'Content-Type': 'application/json;charset=utf-8',
			},
		});
	} catch (err) {
		return new Response('Error parsing JSON content', {
			status: 400,
			error: err,
		});
	}
}
