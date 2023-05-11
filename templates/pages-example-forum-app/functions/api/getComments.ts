export const onRequestGet: ({ env: Env }) => Promise<Response> = async ({ env }) => {
	try {
		const value = await env.comment_db.list(); // Get all the comments from the KV store called comment_db
		const comments = await Promise.all(
			value.keys.map(async key => {
				const comment = await env.comment_db.get(key.name);
				return JSON.parse(comment);
			})
		);
		return new Response(JSON.stringify(comments), {
			headers: {
				'Content-Type': 'application/json',
			},
		});
	} catch (error: any) {
		return new Response(error.message, {
			status: 500,
		});
	}
};
