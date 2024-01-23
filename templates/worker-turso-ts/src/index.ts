import { createClient, Client as LibsqlClient } from "@libsql/client/web";
import { Router, RouterType } from "itty-router";

export interface Env {
	// The environment variable containing your the URL for your Turso database.
	LIBSQL_DB_URL?: string;
	// The Secret that contains the authentication token for your Turso database.
	LIBSQL_DB_AUTH_TOKEN?: string;

	// These objects are created before first use, then stashed here
	// for future use
	router?: RouterType;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (env.router === undefined) {
			env.router = buildRouter(env);
		}

		return env.router.handle(request);
	},
};

function buildLibsqlClient(env: Env): LibsqlClient {
	const url = env.LIBSQL_DB_URL?.trim();
	if (url === undefined) {
		throw new Error("LIBSQL_DB_URL env var is not defined");
	}

	const authToken = env.LIBSQL_DB_AUTH_TOKEN?.trim();
	if (authToken === undefined) {
		throw new Error("LIBSQL_DB_AUTH_TOKEN env var is not defined");
	}

	return createClient({ url, authToken });
}

function buildRouter(env: Env): RouterType {
	const router = Router();

	router.get("/users", async () => {
		const client = buildLibsqlClient(env);
		const rs = await client.execute("select * from example_users");
		return Response.json(rs);
	});

	router.get("/add-user", async (request) => {
		const client = buildLibsqlClient(env);
		const email = request.query.email;
		if (email === undefined) {
			return new Response("Missing email", { status: 400 });
		}
		if (typeof email !== "string") {
			return new Response("email must be a single string", { status: 400 });
		}
		if (email.length === 0) {
			return new Response("email length must be > 0", { status: 400 });
		}

		try {
			await client.execute({
				sql: "insert into example_users values (?)",
				args: [email],
			});
		} catch (e) {
			console.error(e);
			return new Response("database insert failed");
		}

		return new Response("Added");
	});

	router.all("*", () => new Response("Not Found.", { status: 404 }));

	return router;
}
