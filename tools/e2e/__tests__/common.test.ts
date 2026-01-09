import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	deleteDatabase,
	deleteKVNamespace,
	deleteProject,
	deleteWorker,
	listTmpDatabases,
	listTmpE2EProjects,
	listTmpE2EWorkers,
	listTmpKVNamespaces,
} from "../common";

const originalAccountID = process.env.CLOUDFLARE_ACCOUNT_ID;
const MOCK_CLOUDFLARE_ACCOUNT_ID = "mock-cloudflare-account";

const now = new Date();
const nowStr = now.toJSON();
const oldTime = new Date();
oldTime.setMinutes(oldTime.getMinutes() - 100);
const oldTimeStr = oldTime.toJSON();

const originalDispatcher = getGlobalDispatcher();
let agent: MockAgent;

beforeEach(() => {
	// Mock out the undici Agent
	agent = new MockAgent();
	agent.disableNetConnect();
	setGlobalDispatcher(agent);
	process.env.CLOUDFLARE_ACCOUNT_ID = MOCK_CLOUDFLARE_ACCOUNT_ID;
});

afterEach(() => {
	agent.assertNoPendingInterceptors();
	setGlobalDispatcher(originalDispatcher);
	process.env.CLOUDFLARE_ACCOUNT_ID = originalAccountID;
});

describe("listTmpE2EProjects()", () => {
	it("makes paged REST requests and returns a filtered list of projects", async () => {
		agent
			.get("https://api.cloudflare.com")
			.intercept({
				path: `/client/v4/accounts/${MOCK_CLOUDFLARE_ACCOUNT_ID}/pages/projects`,
				query: {
					page: 1,
				},
			})
			.reply(
				200,
				JSON.stringify({
					result: [
						{ name: "pages-project-1", created_on: nowStr },
						{ name: "pages-project-2", created_on: oldTimeStr },
						{ name: "tmp-e2e-project-1", created_on: nowStr },
						{ name: "tmp-e2e-project-2", created_on: oldTimeStr },
						{ name: "pages-project-3", created_on: nowStr },
						{ name: "pages-project-4", created_on: oldTimeStr },
						{ name: "tmp-e2e-project-3", created_on: nowStr },
						{ name: "tmp-e2e-project-4", created_on: oldTimeStr },
						{ name: "pages-project-5", created_on: nowStr },
						{ name: "pages-project-6", created_on: oldTimeStr },
					],
					result_info: {
						page: 1,
						per_page: 10,
						count: 10,
						total_count: 12,
						total_pages: 2,
					},
				})
			);

		agent
			.get("https://api.cloudflare.com")
			.intercept({
				path: `/client/v4/accounts/${MOCK_CLOUDFLARE_ACCOUNT_ID}/pages/projects`,
				query: {
					page: 2,
				},
			})
			.reply(
				200,
				JSON.stringify({
					result: [
						{ name: "tmp-e2e-project-5", created_on: nowStr },
						{ name: "tmp-e2e-project-6", created_on: oldTimeStr },
					],
					result_info: {
						page: 2,
						per_page: 10,
						count: 2,
						total_count: 12,
						total_pages: 2,
					},
				})
			);

		const result = await listTmpE2EProjects();
		expect(result.map((p) => p.name)).toMatchInlineSnapshot(`
			[
			  "tmp-e2e-project-2",
			  "tmp-e2e-project-4",
			  "tmp-e2e-project-6",
			]
		`);
	});
});

describe("deleteProject()", () => {
	it("makes a REST request to delete the given project", async () => {
		const MOCK_PROJECT = "mock-pages-project";
		agent
			.get("https://api.cloudflare.com")
			.intercept({
				path: `/client/v4/accounts/${MOCK_CLOUDFLARE_ACCOUNT_ID}/pages/projects/${MOCK_PROJECT}`,
				method: "DELETE",
			})
			.reply(200, JSON.stringify({ result: [] }));
		await deleteProject(MOCK_PROJECT);
	});
});

describe("listTmpKVNamespaces()", () => {
	it("makes a REST request and returns a filtered list of kv namespaces", async () => {
		agent
			.get("https://api.cloudflare.com")
			.intercept({
				path: `/client/v4/accounts/${MOCK_CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces`,
				method: "GET",
				query: {
					page: 1,
				},
			})
			.reply(
				200,
				JSON.stringify({
					result: [
						{ id: "kv-tmp-e2e", title: "kv-1" },
						{ id: "kv-2", title: "kv-2" },
						{ id: "tmp_e2e", title: "kv-3" },
						{ id: "kv-4", title: "kv-4" },
						{ id: "kv-5", title: "kv-5" },
						{ id: "kv-6", title: "kv-6" },
						{ id: "tmp_e2e_kv", title: "kv-7" },
						{ id: "kv-8", title: "kv-8" },
						{ id: "kv-9", title: "kv-9" },
						{ id: "kv-10", title: "kv-10" },
						...Array(90).fill({ id: "kv-10", title: "kv-10" }),
					],
					result_info: {
						page: 1,
						per_page: 10,
						count: 10,
						total_count: 11,
						total_pages: 2,
					},
				})
			);
		agent
			.get("https://api.cloudflare.com")
			.intercept({
				path: `/client/v4/accounts/${MOCK_CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces`,
				method: "GET",
				query: {
					page: 2,
				},
			})
			.reply(
				200,
				JSON.stringify({
					result: [{ id: "kv-tmp-e2e-11", title: "kv-11" }],
					result_info: {
						page: 2,
						per_page: 10,
						count: 2,
						total_count: 12,
						total_pages: 2,
					},
				})
			);

		const result = await listTmpKVNamespaces();

		expect(result.map((p) => p.id)).toMatchInlineSnapshot(`[]`);
	});
});

describe("deleteKVNamespace()", () => {
	it("makes a REST request to delete the given project", async () => {
		const MOCK_KV = "tmp_e2e_kv";
		agent
			.get("https://api.cloudflare.com")
			.intercept({
				path: `/client/v4/accounts/${MOCK_CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${MOCK_KV}`,
				method: "DELETE",
			})
			.reply(200, JSON.stringify({ result: [] }));
		await deleteKVNamespace(MOCK_KV);
	});
});

describe("listTmpDatabases()", () => {
	it("makes a REST request and returns a filtered list of d1 databases", async () => {
		agent
			.get("https://api.cloudflare.com")
			.intercept({
				path: `/client/v4/accounts/${MOCK_CLOUDFLARE_ACCOUNT_ID}/d1/database`,
				method: "GET",
				query: {
					page: 1,
				},
			})
			.reply(
				200,
				JSON.stringify({
					result: [
						{ uuid: "1", name: "db-1", created_at: nowStr },
						{ uuid: "2", name: "db-2", created_at: oldTimeStr },
						{ uuid: "3", name: "tmp-e2e-db-1", created_at: nowStr },
						{ uuid: "4", name: "tmp-e2e-db-2", created_at: oldTimeStr },
						{ uuid: "5", name: "db-3", created_at: nowStr },
						{ uuid: "6", name: "db-4", created_at: oldTimeStr },
						{ uuid: "7", name: "tmp-e2e-db-3", created_at: nowStr },
						{ uuid: "8", name: "tmp-e2e-db-4", created_at: oldTimeStr },
						{ uuid: "9", name: "db-5", created_at: nowStr },
						{ uuid: "10", name: "db-6", created_at: oldTimeStr },
						...Array(90).fill({
							uuid: "10",
							name: "db-6",
							created_at: oldTimeStr,
						}),
					],
					result_info: {
						page: 1,
						per_page: 10,
						count: 50,
						total_count: 12,
						total_pages: 2,
					},
				})
			);
		agent
			.get("https://api.cloudflare.com")
			.intercept({
				path: `/client/v4/accounts/${MOCK_CLOUDFLARE_ACCOUNT_ID}/d1/database`,
				method: "GET",
				query: {
					page: 2,
				},
			})
			.reply(
				200,
				JSON.stringify({
					result: [
						{ uuid: "11", name: "db-11", created_at: nowStr },
						{ uuid: "12", name: "db-12", created_at: oldTimeStr },
					],
					result_info: {
						page: 2,
						per_page: 10,
						count: 2,
						total_count: 12,
						total_pages: 2,
					},
				})
			);

		const result = await listTmpDatabases();

		expect(result.map((p) => p.name)).toMatchInlineSnapshot(`
			[
			  "tmp-e2e-db-2",
			  "tmp-e2e-db-4",
			]
		`);
	});
});

describe("deleteDatabase()", () => {
	it("makes a REST request to delete the given project", async () => {
		const MOCK_DB = "tmp-e2e-db";
		agent
			.get("https://api.cloudflare.com")
			.intercept({
				path: `/client/v4/accounts/${MOCK_CLOUDFLARE_ACCOUNT_ID}/d1/database/${MOCK_DB}`,
				method: "DELETE",
			})
			.reply(200, JSON.stringify({ result: [] }));
		await deleteDatabase(MOCK_DB);
	});
});

describe("listTmpE2EWorkers()", () => {
	it("makes a REST request and returns a filtered list of workers", async () => {
		agent
			.get("https://api.cloudflare.com")
			.intercept({
				path: `/client/v4/accounts/${MOCK_CLOUDFLARE_ACCOUNT_ID}/workers/scripts`,
				query: { page: 1 },
				method: "GET",
			})
			.reply(
				200,
				JSON.stringify({
					result: [
						{ id: "wprker-1", created_on: nowStr },
						{ id: "wprker-2", created_on: oldTimeStr },
						{ id: "tmp-e2e-worker-1", created_on: nowStr },
						{ id: "tmp-e2e-worker-2", created_on: oldTimeStr },
						{ id: "wprker-3", created_on: nowStr },
						{ id: "wprker-4", created_on: oldTimeStr },
						{ id: "tmp-e2e-worker-3", created_on: nowStr },
						{ id: "tmp-e2e-worker-4", created_on: oldTimeStr },
						{ id: "wprker-5", created_on: nowStr },
						{ id: "wprker-6", created_on: oldTimeStr },
					],
				})
			);

		const result = await listTmpE2EWorkers();

		expect(result.map((p) => p.id)).toMatchInlineSnapshot(`
			[
			  "wprker-2",
			  "tmp-e2e-worker-2",
			  "wprker-4",
			  "tmp-e2e-worker-4",
			  "wprker-6",
			]
		`);
	});
});

describe("deleteWorker()", () => {
	it("makes a REST request to delete the given project", async () => {
		const MOCK_WORKER = "mock-worker";
		agent
			.get("https://api.cloudflare.com")
			.intercept({
				path: `/client/v4/accounts/${MOCK_CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${MOCK_WORKER}`,
				method: "DELETE",
			})
			.reply(200, JSON.stringify({ result: [] }));
		await deleteWorker(MOCK_WORKER);
	});
});
