// =============================================================================
// Types

interface User {
	username: string;
	name: string;
	email: string;
}

interface Post {
	slug: string;
	author: User;
	body: string;
}

// =============================================================================
// Queries

type QueryResult = User & Omit<Post, "author">;
function queryResultToPost(result: QueryResult): Post {
	return {
		slug: result.slug,
		body: result.body,
		author: {
			username: result.username,
			name: result.name,
			email: result.email,
		},
	};
}

export async function listPosts(env: Env): Promise<Post[]> {
	const results = await env.DATABASE.prepare(
		`
		SELECT slug, body, username, name, email
		FROM posts
		INNER JOIN users ON posts.author = users.username
		`
	).all<QueryResult>();
	return results.results.map(queryResultToPost);
}

export async function readPost(env: Env, slug: string): Promise<Post | null> {
	const result = await env.DATABASE.prepare(
		`
		SELECT slug, body, username, name, email
		FROM posts
		INNER JOIN users ON posts.author = users.username
		WHERE slug = ?1
		`
	)
		.bind(slug)
		.first<QueryResult>();
	return result === null ? null : queryResultToPost(result);
}

export async function upsertPost(
	env: Env,
	slug: string,
	body: string
): Promise<void> {
	await env.DATABASE.prepare(
		`
		INSERT INTO posts (slug, author, body)
		VALUES (?1, ?2, ?3)
		ON CONFLICT (slug) DO UPDATE SET
			author = ?2,
			body = ?3
		`
	)
		.bind(slug, "admin", body)
		.run();
}

// =============================================================================
// Routes

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

// =============================================================================
// Entrypoint

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
