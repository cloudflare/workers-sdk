import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach, describe, it } from "vitest";
import {
	deleteProject,
	deleteWorker,
	listTmpE2EProjects,
	listTmpE2EWorkers,
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
	it("makes paged REST requests and returns a filtered list of projects", async ({
		expect,
	}) => {
		agent
			.get("https://api.cloudflare.com")
			.intercept({
				path: `/client/v4/accounts/${MOCK_CLOUDFLARE_ACCOUNT_ID}/pages/projects`,
				query: {
					per_page: 10,
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
				})
			);

		agent
			.get("https://api.cloudflare.com")
			.intercept({
				path: `/client/v4/accounts/${MOCK_CLOUDFLARE_ACCOUNT_ID}/pages/projects`,
				query: {
					per_page: 10,
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

describe("listTmpE2EWorkers()", () => {
	it("makes a REST request and returns a filtered list of workers", async ({
		expect,
	}) => {
		agent
			.get("https://api.cloudflare.com")
			.intercept({
				path: `/client/v4/accounts/${MOCK_CLOUDFLARE_ACCOUNT_ID}/workers/scripts`,
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
			  "tmp-e2e-worker-2",
			  "tmp-e2e-worker-4",
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
