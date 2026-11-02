import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { sendMessage } from "../gchat";
import worker from "../index";

vi.mock("../gchat", () => ({ sendMessage: vi.fn() }));

const env = {
	ALERTS_WEBHOOK: "https://chat.example.com/alerts",
	GITHUB_PAT: "test-token",
} as Env;

function checkEvent(name: string, conclusion = "failure") {
	return {
		action: "completed",
		check_run: {
			id: 123,
			name,
			conclusion,
			check_suite: { id: 456, head_branch: "changeset-release/main" },
			pull_requests: [{ number: 16646 }],
			started_at: "2026-11-02T10:32:43Z",
			completed_at: "2026-11-02T10:32:44Z",
			html_url:
				"https://github.com/cloudflare/workers-sdk/actions/runs/1/job/123",
		},
		repository: { owner: { login: "cloudflare" }, name: "workers-sdk" },
	};
}

async function handleCheck(name: string, conclusion = "failure") {
	return handleWebhook(checkEvent(name, conclusion));
}

async function handleWebhook(body: unknown) {
	return worker.fetch(
		new Request("https://bot.example.com/github", {
			method: "POST",
			body: JSON.stringify(body),
		}),
		env
	);
}

function suiteResponse(
	checks: { name: string; conclusion: string | null }[],
	totalCount = checks.length
) {
	return Response.json({ check_runs: checks, total_count: totalCount });
}

describe("Version Packages CI alerts", () => {
	const fetchMock = vi.fn<typeof fetch>();
	const sendMessageMock = vi.mocked(sendMessage);

	beforeEach(() => {
		fetchMock.mockReset().mockImplementation(async () => Response.json({}));
		sendMessageMock.mockReset().mockResolvedValue(undefined);
		vi.stubGlobal("fetch", fetchMock);
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it.for(["cancelled", "success", "skipped", "neutral"])(
		"ignores %s checks without fetching GitHub",
		async (conclusion, { expect }) => {
			await handleCheck("Tests", conclusion);
			expect(sendMessageMock).not.toHaveBeenCalled();
			expect(fetchMock).not.toHaveBeenCalled();
		}
	);

	it.for([
		{ owner: "..", repo: "workers-sdk" },
		{ owner: "cloudflare/../other-org", repo: "workers-sdk" },
		{ owner: "cloudflare", repo: "workers-sdk/../../other-repo" },
		{ owner: "cloudflare", repo: "another-repo" },
	])(
		"does not authenticate lookups outside workers-sdk: %j",
		async ({ owner, repo }, { expect }) => {
			const event = checkEvent("Tests");
			await handleWebhook({
				...event,
				repository: { owner: { login: owner }, name: repo },
			});

			expect(sendMessageMock).toHaveBeenCalledOnce();
			expect(fetchMock).not.toHaveBeenCalled();
		}
	);

	it.for([
		"456/../../other-path",
		"456?unexpected=query",
		null,
		0,
		-1,
		1.5,
		Number.MAX_SAFE_INTEGER + 1,
	])(
		"does not authenticate lookups with an invalid suite ID: %s",
		async (suiteId, { expect }) => {
			const event = checkEvent("Tests");
			await handleWebhook({
				...event,
				check_run: {
					...event.check_run,
					check_suite: { ...event.check_run.check_suite, id: suiteId },
				},
			});

			expect(sendMessageMock).toHaveBeenCalledOnce();
			expect(fetchMock).not.toHaveBeenCalled();
		}
	);

	it("suppresses the Tests summary when partitions only passed or were cancelled", async ({
		expect,
	}) => {
		fetchMock.mockResolvedValueOnce(
			suiteResponse([
				{ name: "Tests", conclusion: "failure" },
				{ name: "Checks", conclusion: "success" },
				{ name: "Test partition (Linux, runtime, 1)", conclusion: "success" },
				{
					name: "Test partition (Windows, runtime, 2)",
					conclusion: "cancelled",
				},
			])
		);

		await handleCheck("Tests");

		expect(sendMessageMock).not.toHaveBeenCalled();
		expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
			"https://api.github.com/repos/cloudflare/workers-sdk/check-suites/456/check-runs?per_page=100&page=1",
			{
				headers: {
					"User-Agent": "Cloudflare ANT Status bot",
					Authorization: "Bearer test-token",
					Accept: "application/vnd.github+json",
				},
			}
		);
	});

	it.for([
		"C3 E2E (pnpm, Linux) - frameworks",
		"C3 E2E (pnpm, Linux, experimental) - frameworks",
		"C3 E2E (pnpm@11.5.1, Linux) - frameworks",
		"C3 E2E (npm, Linux) - frameworks",
	])("suppresses cancellation-only %s summaries", async (name, { expect }) => {
		fetchMock.mockResolvedValueOnce(
			suiteResponse([
				{ name, conclusion: "failure" },
				{ name: `${name} 1/2`, conclusion: "success" },
				{ name: `${name} 2/2`, conclusion: "cancelled" },
			])
		);

		await handleCheck(name);

		expect(sendMessageMock).not.toHaveBeenCalled();
	});

	it.for(["failure", "timed_out", "skipped", null])(
		"retains the summary alert when a partition concluded %s",
		async (conclusion, { expect }) => {
			fetchMock.mockResolvedValueOnce(
				suiteResponse([
					{ name: "Test partition (Linux, runtime, 1)", conclusion },
					{
						name: "Test partition (Windows, runtime, 2)",
						conclusion: "cancelled",
					},
				])
			);

			await handleCheck("Tests");

			expect(sendMessageMock).toHaveBeenCalledOnce();
		}
	);

	it("checks framework shards across package managers", async ({ expect }) => {
		fetchMock.mockResolvedValueOnce(
			suiteResponse([
				{ name: "C3 E2E (npm, Linux) - frameworks 1/1", conclusion: "success" },
				{
					name: "C3 E2E (pnpm, Linux) - frameworks 1/1",
					conclusion: "cancelled",
				},
			])
		);

		await handleCheck("C3 E2E (npm, Linux) - frameworks");

		expect(sendMessageMock).not.toHaveBeenCalled();
	});

	it("retains a C3 summary alert when another package manager's shard failed", async ({
		expect,
	}) => {
		fetchMock.mockResolvedValueOnce(
			suiteResponse([
				{
					name: "C3 E2E (npm, Linux) - frameworks 1/1",
					conclusion: "cancelled",
				},
				{
					name: "C3 E2E (pnpm, Linux) - frameworks 1/1",
					conclusion: "failure",
				},
			])
		);

		await handleCheck("C3 E2E (npm, Linux) - frameworks");

		expect(sendMessageMock).toHaveBeenCalledOnce();
	});

	it("retains an alert when only unrelated C3 jobs were cancelled", async ({
		expect,
	}) => {
		fetchMock.mockResolvedValueOnce(
			suiteResponse([
				{ name: "C3 E2E (npm, Linux) - frameworks 1/1", conclusion: "success" },
				{ name: "C3 E2E (npm, Linux) - cli", conclusion: "cancelled" },
			])
		);

		await handleCheck("C3 E2E (npm, Linux) - frameworks");

		expect(sendMessageMock).toHaveBeenCalledOnce();
	});

	it("retains an alert when dependency results are missing", async ({
		expect,
	}) => {
		fetchMock.mockResolvedValueOnce(suiteResponse([]));

		await handleCheck("Tests");

		expect(sendMessageMock).toHaveBeenCalledOnce();
	});

	it.for([
		["Test partition (Linux, runtime, 1)", "failure"],
		["C3 E2E (pnpm, Linux) - frameworks 1/3", "failure"],
		["Tests", "timed_out"],
	])(
		"alerts directly for %s with conclusion %s",
		async ([name, conclusion], { expect }) => {
			await handleCheck(name, conclusion);

			expect(sendMessageMock).toHaveBeenCalledExactlyOnceWith(
				env.ALERTS_WEBHOOK,
				expect.objectContaining({ cardsV2: expect.any(Array) }),
				"-vp-ci-failure-pr-16646"
			);
			expect(sendMessageMock.mock.calls[0][1]).toMatchObject({
				cardsV2: [
					{
						card: {
							header: {
								title: expect.stringContaining(
									conclusion === "timed_out" ? "Timed out" : "Failed"
								),
							},
						},
					},
				],
			});
			expect(fetchMock).not.toHaveBeenCalled();
		}
	);

	it("checks later pages before suppressing an alert", async ({ expect }) => {
		fetchMock
			.mockResolvedValueOnce(
				suiteResponse(
					Array.from({ length: 100 }, (_, i) => ({
						name: `Test partition (${i})`,
						conclusion: "cancelled",
					})),
					101
				)
			)
			.mockResolvedValueOnce(
				suiteResponse(
					[{ name: "Test partition (100)", conclusion: "failure" }],
					101
				)
			);

		await handleCheck("Tests");

		expect(sendMessageMock).toHaveBeenCalledOnce();
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock.mock.calls[1][0]).toContain("page=2");
	});

	it("retains the alert when a later page is incomplete", async ({
		expect,
	}) => {
		fetchMock
			.mockResolvedValueOnce(
				suiteResponse(
					Array.from({ length: 100 }, (_, i) => ({
						name: `Test partition (${i})`,
						conclusion: "cancelled",
					})),
					101
				)
			)
			.mockResolvedValueOnce(suiteResponse([], 101));

		await handleCheck("Tests");

		expect(sendMessageMock).toHaveBeenCalledOnce();
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it.for([403, 500])(
		"retains the alert when GitHub returns %s",
		async (status, { expect }) => {
			fetchMock.mockResolvedValueOnce(new Response("GitHub error", { status }));

			await handleCheck("Tests");

			expect(sendMessageMock).toHaveBeenCalledOnce();
		}
	);

	it("retains the alert when the GitHub request fails", async ({ expect }) => {
		fetchMock.mockRejectedValueOnce(new Error("Network error"));

		await handleCheck("Tests");

		expect(sendMessageMock).toHaveBeenCalledOnce();
	});
});
