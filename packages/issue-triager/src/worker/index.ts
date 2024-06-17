import { Hono } from 'hono';
import { IssuesStore } from './issues/IssuesStore';
import { Embeddings } from './embeddings/Embeddings';
import { Issue } from '../shared/types';
export { IssuesStore };

export type Env = {
	AI: Ai;
	GITHUB_API_TOKEN: string;
	ISSUES_INDEX: VectorizeIndex;
	ISSUES_STORE: DurableObjectNamespace<IssuesStore>;
	ISSUE_TRIAGER_API_KEY: string;
};

const app = new Hono<{ Bindings: Env }>();

export default {
	fetch: app.fetch,
} satisfies ExportedHandler<Env>;

/**
 * This app is intended for local use only, but if it is accidentally deployed,
 * the API key will protect against unauthorized access.
 */
app.use(async (ctx, next) => {
	const apiKey = ctx.env.ISSUE_TRIAGER_API_KEY;
	const providedApiKey = ctx.req.header('issue-triager-api-key');

	if (!providedApiKey || providedApiKey !== apiKey) {
		return ctx.json('Unauthorized', 401);
	}

	await next();
});

app.get('/last_updated_at', async (ctx) => {
	const { env, json, req } = ctx;

	const id = env.ISSUES_STORE.idFromName('issue-triager');
	const issueStore = env.ISSUES_STORE.get(id);
	const lastUpdatedAt = await issueStore.getLastUpdatedTimestamp();

	return json({ data: lastUpdatedAt });
});

app.post('/last_updated_at', async (ctx) => {
	const { env, json, req } = ctx;

	const date = await req.text();
	const id = env.ISSUES_STORE.idFromName('issue-triager');
	const issueStore = env.ISSUES_STORE.get(id);
	await issueStore.setLastUpdatedTimestamp(date);

	return json({ message: `Last updated timestamp set to ${date}.` });
});

app.post('/embeddings', async (ctx) => {
	const { env, json, req } = ctx;

	const body = (await req.json()) as Issue[];
	const embeddings = new Embeddings(env.AI, env.ISSUES_INDEX);
	const promises = [] as Promise<boolean>[];

	for (const issue of body) {
		const promise = embeddings.upsert(issue.number.toString(), JSON.stringify(issue), {
			issueNumber: issue.number,
		});
		promises.push(promise);
	}

	await Promise.all(promises);

	return json({ message: `Embedded ${promises.length} issues.` });
});

app.post('/embeddings/similar', async (ctx) => {
	const { env, json, req } = ctx;

	const issue = (await req.json()) as Issue;
	const embeddings = new Embeddings(env.AI, env.ISSUES_INDEX);
	const similarIssues = await embeddings.similar(issue.body);

	return json(similarIssues);
});
