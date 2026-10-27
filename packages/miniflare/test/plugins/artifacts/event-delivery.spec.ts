import { Miniflare, Response } from "miniflare";
import { onTestFinished, test, vi } from "vitest";
import { singleModuleManifest, useDispose, useTmp } from "../../test-shared";
import type { ArtifactsEventMessage } from "../../../src/workers/artifacts/events";
import type { MiniflareOptions, WorkerOptions } from "miniflare";

const WORKER_NAME = "artifacts-events";
const QUEUE = "artifacts-events";

// One Worker that manages repositories, consumes the subscribed queue, and
// runs a Workflow, reporting every delivered message back to the test.
const SCRIPT = `
import { WorkflowEntrypoint } from "cloudflare:workers";

export class OnRepoEvent extends WorkflowEntrypoint {
  async run(event, step) {
    await step.do("report", () =>
      this.env.REPORTER.fetch("http://reporter/workflow", {
        method: "POST",
        body: JSON.stringify(event.payload),
      }).then(() => "reported")
    );
  }
}

export default {
  async fetch(request, env) {
    const { method, name, args = [] } = await request.json();
    const target = name === undefined ? env.REPOS : await env.REPOS.get(name);
    return Response.json(await target[method](...args));
  },
  async queue(batch, env) {
    for (const message of batch.messages) {
      await env.REPORTER.fetch("http://reporter/queue", {
        method: "POST",
        body: JSON.stringify(message.body),
      });
      message.ack();
    }
  },
};
`;

type Delivered = { via: "queue" | "workflow"; message: ArtifactsEventMessage };

async function createMiniflare(
	configure: (worker: WorkerOptions["config"]) => void,
	shared: Partial<MiniflareOptions> = {}
): Promise<{ mf: Miniflare; delivered: Delivered[] }> {
	const delivered: Delivered[] = [];
	const config: WorkerOptions["config"] = {
		name: WORKER_NAME,
		compatibilityDate: "2026-09-03",
		manifest: singleModuleManifest(SCRIPT),
		env: {
			REPOS: {
				type: "artifacts",
				namespace: "examples",
				dev: { remote: false },
			},
			REPORTER: {
				type: "fetcher",
				handler: async (request) => {
					const via = new URL(request.url).pathname.slice(
						1
					) as Delivered["via"];
					delivered.push({
						via,
						message: (await request.json()) as ArtifactsEventMessage,
					});
					return new Response();
				},
			},
		},
	};
	configure(config);
	const mf = new Miniflare({
		cf: false,
		resourcePersistencePath: await useTmp(),
		...shared,
		workers: [{ config }],
	});
	return { mf, delivered };
}

async function startMiniflare(
	configure: (worker: WorkerOptions["config"]) => void,
	shared: Partial<MiniflareOptions> = {}
): Promise<{ mf: Miniflare; delivered: Delivered[] }> {
	const started = await createMiniflare(configure, shared);
	useDispose(started.mf);
	await started.mf.ready;
	return started;
}

function consumeQueue(config: WorkerOptions["config"]): void {
	config.triggers = [
		...(config.triggers ?? []),
		{ type: "queue", name: QUEUE, maxBatchTimeout: 0 },
	];
}

function addWorkflow(config: WorkerOptions["config"]): void {
	config.env = {
		...config.env,
		ON_REPO_EVENT: {
			type: "workflow",
			name: "on-repo-event",
			worker: WORKER_NAME,
			exportName: "OnRepoEvent",
		},
	};
}

async function rpc(
	mf: Miniflare,
	method: string,
	args: unknown[] = [],
	name?: string
): Promise<unknown> {
	const response = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({ method, args, name }),
	});
	if (!response.ok) {
		throw new Error(await response.text());
	}
	return response.json();
}

test("Queue subscriptions receive account-level events as documented messages", async ({
	expect,
}) => {
	const { mf, delivered } = await startMiniflare(consumeQueue, {
		artifactsEventSubscriptions: [
			{ queue: QUEUE, source: { type: "artifacts" } },
		],
	});

	await rpc(mf, "create", ["demo", { description: "Demo" }]);

	await vi.waitFor(() => expect(delivered).toHaveLength(1));
	const [{ via, message }] = delivered;
	expect(via).toBe("queue");
	expect(message).toMatchObject({
		type: "cf.artifacts.repo.created",
		source: { type: "artifacts", namespace: "examples", repoName: "demo" },
		payload: {
			repoId: expect.any(String),
			defaultBranch: "main",
			description: "Demo",
			readOnly: false,
			lastPushAt: null,
		},
		metadata: {
			accountId: "local",
			eventSubscriptionId: expect.stringMatching(/^[0-9a-f]{32}$/),
			eventSchemaVersion: 1,
			eventTimestamp: expect.any(String),
		},
	});
	// Token events belong to the repository-level source.
	await rpc(mf, "createToken", ["read"], "demo");
	await new Promise((resolve) => setTimeout(resolve, 200));
	expect(delivered).toHaveLength(1);
});

test("repository subscriptions only receive their repository's selected events", async ({
	expect,
}) => {
	const { mf, delivered } = await startMiniflare(consumeQueue, {
		artifactsEventSubscriptions: [
			{
				queue: QUEUE,
				source: {
					type: "artifacts.repo",
					namespace: "examples",
					repoName: "demo",
				},
				events: ["cf.artifacts.repo.token.revoked"],
			},
			{
				queue: QUEUE,
				source: {
					type: "artifacts.repo",
					namespace: "other",
					repoName: "demo",
				},
			},
		],
	});

	await rpc(mf, "create", ["other-repo"]);
	await rpc(mf, "create", ["demo"]);
	const token = (await rpc(mf, "createToken", ["read"], "demo")) as {
		id: string;
	};
	await rpc(mf, "revokeToken", [token.id], "demo");

	await vi.waitFor(() => expect(delivered).toHaveLength(1));
	expect(delivered[0].message).toMatchObject({
		type: "cf.artifacts.repo.token.revoked",
		source: { type: "artifacts.repo", namespace: "examples", repoName: "demo" },
		payload: { tokenId: token.id },
	});
	await new Promise((resolve) => setTimeout(resolve, 200));
	expect(delivered).toHaveLength(1);
});

test("Artifacts event triggers start the Worker's Workflow with the event", async ({
	expect,
}) => {
	const { mf, delivered } = await startMiniflare((config) => {
		addWorkflow(config);
		config.triggers = [
			{
				type: "artifacts-event",
				eventType: "cf.artifacts.repo.forked",
				filter: { namespace: "examples", repoName: "source" },
				targets: [{ type: "workflow", workflowName: "on-repo-event" }],
			},
		];
	});

	await rpc(mf, "create", ["source"]);
	await rpc(mf, "create", ["unrelated"]);
	await rpc(mf, "fork", ["ignored"], "unrelated");
	await rpc(mf, "fork", ["copy"], "source");

	await vi.waitFor(() => expect(delivered).toHaveLength(1), { timeout: 5_000 });
	expect(delivered[0]).toMatchObject({
		via: "workflow",
		message: {
			type: "cf.artifacts.repo.forked",
			source: { type: "artifacts", namespace: "examples", repoName: "source" },
			payload: { namespace: "examples", repoName: "copy" },
		},
	});
});

test("Artifacts event triggers must target the Worker's own Workflows", async ({
	expect,
}) => {
	const { mf } = await createMiniflare((config) => {
		config.triggers = [
			{
				type: "artifacts-event",
				eventType: "cf.artifacts.repo.created",
				targets: [{ type: "workflow", workflowName: "missing" }],
			},
		];
	});
	onTestFinished(() => mf.dispose().catch(() => {}));

	await expect(mf.ready).rejects.toThrow(
		'Artifacts event trigger "cf.artifacts.repo.created" of Worker "artifacts-events" targets Workflow "missing", which that Worker doesn\'t define.'
	);
});

test("Queue subscriptions reject events their source doesn't publish", async ({
	expect,
}) => {
	await expect(
		startMiniflare(consumeQueue, {
			artifactsEventSubscriptions: [
				{
					queue: QUEUE,
					source: { type: "artifacts" },
					events: ["cf.artifacts.repo.token.created"],
				},
			],
		})
	).rejects.toThrow(
		'Event "cf.artifacts.repo.token.created" is not published by the "artifacts" source.'
	);
});
