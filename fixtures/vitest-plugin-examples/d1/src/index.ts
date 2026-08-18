import { listPosts, readPost, upsertPost } from "./utils";

async function handleListRequest(env: Env, origin: string): Promise<Response> {
	const posts = await listPosts(env);
	const body = posts
		.map((post) => `${origin}${post.slug}\n${post.body}`)
		.join(`\n\n${"-".repeat(20)}\n`);
	return new Response(body);
}

async function handleReadRequest(env: Env, slug: string): Promise<Response> {
	const post = await readPost(env, slug);
	if (post === null) return new Response("Not Found", { status: 404 });
	else return new Response(post.body);
}

async function handlePutRequest(
	request: Request,
	env: Env,
	slug: string
): Promise<Response> {
	if (slug === "/") return new Response("Method Not Allowed", { status: 405 });
	await upsertPost(env, slug, await request.text());
	return new Response(null, { status: 204 });
}

export default <ExportedHandler<Env>>{
	fetch(request, env) {
		const { origin, pathname } = new URL(request.url);
		if (request.method === "GET") {
			if (pathname === "/") return handleListRequest(env, origin);
			else return handleReadRequest(env, pathname);
		} else if (request.method === "PUT") {
			return handlePutRequest(request, env, pathname);
		} else {
			return new Response("Method Not Allowed", { status: 405 });
		}
	},
};
