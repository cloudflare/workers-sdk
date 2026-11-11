import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, describe, it, vi } from "vitest";
import MockWebSocketServer from "vitest-websocket-mock";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { MockWebSocket } from "../helpers/mock-web-socket";
import { msw } from "../helpers/msw";
import { runWrangler } from "../helpers/run-wrangler";

vi.mock("ws", async (importOriginal) => {
	const realModule = await importOriginal<typeof import("ws")>();
	const module = { __esModule: true };
	Object.defineProperties(module, {
		default: { get: () => MockWebSocket },
		WebSocket: { get: () => MockWebSocket },
		WebSocketServer: { get: () => realModule.WebSocketServer },
	});
	return module;
});

const websocketURL = "ws://localhost:1235";

function deployment(id: string, created_on: string) {
	return {
		id,
		url: `https://${id}.mock.pages.dev`,
		environment: "production",
		created_on,
		latest_stage: { ended_on: created_on, status: "success", name: "deploy" },
		deployment_trigger: { metadata: { branch: "main", commit_hash: "abc" } },
		project_name: "mock-project",
	};
}

describe("pages deployment tail after a rollback", () => {
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	mockAccountId();
	mockApiToken();
	mockConsoleMethods();

	let ws: MockWebSocketServer;
	afterEach(() => {
		ws?.close();
	});

	it("tails the canonical (live) production deployment, not the most recently created one", async ({
		expect,
	}) => {
		setIsTTY(true);
		ws = new MockWebSocketServer(websocketURL);
		const tailedIds: string[] = [];

		msw.use(
			// The latest deployment was superseded by a rollback to the older one.
			http.get(
				`*/accounts/:accountId/pages/projects/:projectName/deployments`,
				() =>
					HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: [
							deployment("rolled-back-from-id", "2022-11-22T12:00:00.000000Z"),
							deployment("canonical-id", "2022-11-01T12:00:00.000000Z"),
						],
					})
			),
			http.get(`*/accounts/:accountId/pages/projects/:projectName`, () =>
				HttpResponse.json({
					success: true,
					errors: [],
					messages: [],
					result: {
						name: "mock-project",
						canonical_deployment: deployment(
							"canonical-id",
							"2022-11-01T12:00:00.000000Z"
						),
					},
				})
			),
			http.post(
				`*/accounts/:accountId/pages/projects/:projectName/deployments/:deploymentId/tails`,
				({ params }) => {
					tailedIds.push(params.deploymentId as string);
					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: {
							id: "tail-id",
							url: websocketURL,
							expires_at: new Date(3005, 1),
						},
					});
				}
			),
			http.delete(
				`*/accounts/:accountId/pages/projects/:projectName/deployments/:deploymentId/tails/:tailId`,
				() =>
					HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: null,
					})
			)
		);

		await runWrangler(
			"pages deployment tail --environment production --project-name mock-project"
		).catch(() => {});

		expect(tailedIds).toEqual(["canonical-id"]);
	});
});
