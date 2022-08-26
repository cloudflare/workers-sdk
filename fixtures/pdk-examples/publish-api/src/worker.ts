import { publish } from "@cloudflare/pdk";
import { Router } from "itty-router";
import type { FetchResult } from "../../../../packages/wrangler/src/cfetch";

type Env = {
	CF_ACCOUNT_ID: string;
	CF_API_TOKEN: string;
	Docs: KVNamespace;
	dispatcher: {
		get: (name: string) => { fetch: typeof fetch };
	};
};

const app = Router();

type Document = [
	key: string, // author+id
	content: string,
	meta: {
		id: string;
		name: string;
		// author: string;
		// version: number; // "clock" counter
		// published: number; // "clock" counter
	}
];

app.get("/fns/:fn", async (req, env: Env) => {
	const doc = await env.Docs.getWithMetadata(req.params.fn);
	if (!doc) {
		return Response.json(
			{
				body: `Document ${req.params.fn} not found`,
			},
			{ status: 404 }
		);
	}
	return Response.json(doc);
});

app.post("/fns/:fn", async (req, env: Env) => {
	const body: FormData = await req.formData();
	const content = body.get("content").toString();

	const published = await publish(content, {
		format: "module",
		scriptId: req.params.fn,
		accountId: env.CF_ACCOUNT_ID,
		apiToken: env.CF_API_TOKEN,
		namespace: "alpha",
		tags: [],
		compatibility_date: "2020-01-01",
		compatibility_flags: [],
	});

	const publishResponse = (await published.json()) as FetchResult;
	if (!publishResponse.success) {
		return Response.json(
			publishResponse.errors?.[0] || "Could not publish the script",
			{ status: 400 }
		);
	}

	await env.Docs.put(req.params.fn, content, {
		metadata: {
			id: req.params.fn,
			name: body.get("name"),
			// author: req.user.email,
			// version: (parseInt(body.get("clock").toString()) || 0) + 1,
		} as Document[2],
	});

	return Response.json({ ok: true });
});

app.get("/fns", async (req, env: Env) => {
	const docs = await env.Docs.list<Document[2]>();
	return Response.json(docs.keys);
});

app.get("/call/:fn", async (req, env: Env) => {
	const worker = env.dispatcher.get(req.params.fn);
	const { pathname } = new URL(req.url);
	return worker.fetch(req);
});

export default {
	async fetch(req: Request, env: Env, ctx: ExecutionContext) {
		try {
			const res = await app.handle(req, env, ctx);
			if (!res) {
				return Response.json({ body: `Not found` }, { status: 404 });
			}
			return res;
		} catch (err) {
			console.error("error", err.message);
			return Response.json({ body: err.message }, { status: 500 });
		}
	},
};
