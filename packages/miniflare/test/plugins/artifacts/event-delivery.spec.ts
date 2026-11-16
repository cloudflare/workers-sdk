import { LogLevel, Miniflare, Response } from "miniflare";
import { onTestFinished, test, vi } from "vitest";
import {
	singleModuleManifest,
	TestLog,
	useDispose,
	useTmp,
} from "../../test-shared";
import type { ArtifactsEventMessage } from "../../../src/workers/artifacts/events";
import type { ArtifactsEventSubscription } from "@cloudflare/config";
import type { MiniflareOptions, WorkerOptions } from "miniflare";

const WORKER_NAME = "artifacts-events";
const SCRIPT = `
import { WorkflowEntrypoint } from "cloudflare:workers";
export class OnRepoEvent extends WorkflowEntrypoint {
  async run(event, step) {
    await step.do("report", () => this.env.REPORTER.fetch("http://reporter", {
      method: "POST", body: JSON.stringify(event.payload),
    }).then(() => "reported"));
  }
}
export default {
  async fetch(request, env) {
    const { method, name, args = [] } = await request.json();
    const target = name === undefined ? env.REPOS : await env.REPOS.get(name);
    return Response.json(await target[method](...args));
  },
};
`;

async function createMiniflare(
	events: ArtifactsEventSubscription[],
	configure: (config: WorkerOptions["config"]) => void = () => {},
	shared: Partial<MiniflareOptions> = {}
) {
	const delivered: ArtifactsEventMessage[] = [];
	const config: WorkerOptions["config"] = {
		name: WORKER_NAME,
		compatibilityDate: "2026-09-03",
		manifest: singleModuleManifest(SCRIPT),
		exports: {
			OnRepoEvent: { type: "workflow", name: "on-repo-event", events },
		},
		env: {
			REPOS: {
				type: "artifacts",
				namespace: "examples",
				dev: { remote: false },
			},
			REPORTER: {
				type: "fetcher",
				handler: async (request) => {
					delivered.push((await request.json()) as ArtifactsEventMessage);
					return new Response();
				},
			},
		},
	};
	configure(config);
	const options: MiniflareOptions = {
		cf: false,
		resourcePersistencePath: await useTmp(),
		...shared,
		workers: [{ config }],
	};
	const mf = new Miniflare(options);
	return { mf, delivered, options };
}

async function startMiniflare(...args: Parameters<typeof createMiniflare>) {
	const started = await createMiniflare(...args);
	useDispose(started.mf);
	await started.mf.ready;
	return started;
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

const CREATED: ArtifactsEventSubscription = {
	type: "cf.artifacts.repo.created",
};

test("warns once when Workflow events have no local namespace", async ({
	expect,
}) => {
	const log = new TestLog();
	const { mf, options } = await startMiniflare(
		[CREATED],
		(config) => {
			delete config.env?.REPOS;
		},
		{ log }
	);
	await mf.setOptions(options);
	expect(log.logsAtLevel(LogLevel.WARN)).toEqual([
		"Workflow events are only published by local Artifacts namespaces, and this instance has none.",
	]);
});

test.for(["export", "binding"] as const)(
	"%s-owned events start a Workflow with the documented message",
	async (mode, { expect }) => {
		const { mf, delivered } = await startMiniflare([CREATED], (config) => {
			if (mode === "binding") {
				delete config.exports;
				config.env = {
					...config.env,
					ON_EVENT: {
						type: "workflow",
						name: "on-repo-event",
						worker: WORKER_NAME,
						exportName: "OnRepoEvent",
						unsafeConfig: { events: [CREATED] },
					},
				};
			}
		});
		await rpc(mf, "create", ["demo", { description: "Demo" }]);
		await vi.waitFor(() => expect(delivered).toHaveLength(1), {
			timeout: 5000,
		});
		expect(delivered[0]).toMatchObject({
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
		await rpc(mf, "createToken", ["read"], "demo");
		await new Promise((resolve) => setTimeout(resolve, 200));
		expect(delivered).toHaveLength(1);
	}
);

test("duplicate event declarations retain separate deliveries and distinct IDs", async ({
	expect,
}) => {
	const { mf, delivered } = await startMiniflare([CREATED, CREATED]);
	await rpc(mf, "create", ["demo"]);
	await vi.waitFor(() => expect(delivered).toHaveLength(2), { timeout: 5000 });
	expect(
		new Set(delivered.map((event) => event.metadata.eventSubscriptionId)).size
	).toBe(2);
});

test.for([
	{ exportEvents: [], deliveries: 1 },
	{ exportEvents: [CREATED], deliveries: 2 },
])(
	"events on a binding to a Workflow export subscribe alongside the export's ($deliveries deliveries)",
	async ({ exportEvents, deliveries }, { expect }) => {
		const { mf, delivered } = await startMiniflare(exportEvents, (config) => {
			config.env = {
				...config.env,
				ON_EVENT: {
					type: "workflow",
					name: "on-repo-event",
					worker: WORKER_NAME,
					exportName: "OnRepoEvent",
					unsafeConfig: { events: [CREATED] },
				},
			};
		});
		await rpc(mf, "create", ["demo"]);
		await vi.waitFor(() => expect(delivered).toHaveLength(deliveries), {
			timeout: 5000,
		});
		await new Promise((resolve) => setTimeout(resolve, 200));
		expect(delivered).toHaveLength(deliveries);
	}
);

test("namespace filters exclude other local namespaces", async ({ expect }) => {
	const { mf, delivered } = await startMiniflare(
		[{ ...CREATED, filter: { namespace: "examples" } }],
		(config) => {
			config.env = {
				...config.env,
				OTHER: {
					type: "artifacts",
					namespace: "other",
					dev: { remote: false },
				},
			};
		}
	);
	const bindings = await mf.getBindings<{
		OTHER: { create(name: string): Promise<unknown> };
	}>();
	await bindings.OTHER.create("excluded");
	await rpc(mf, "create", ["included"]);
	await vi.waitFor(() => expect(delivered).toHaveLength(1), { timeout: 5000 });
	expect(delivered[0].source.namespace).toBe("examples");
	await new Promise((resolve) => setTimeout(resolve, 200));
	expect(delivered).toHaveLength(1);
});

test("repository filters match identity without changing published spelling", async ({
	expect,
}) => {
	const { mf, delivered } = await startMiniflare([
		{
			type: "cf.artifacts.repo.token.revoked",
			filter: { namespace: "examples", repoName: "dEMo" },
		},
	]);
	await rpc(mf, "create", ["other"]);
	const other = (await rpc(mf, "createToken", ["read"], "other")) as {
		id: string;
	};
	await rpc(mf, "revokeToken", [other.id], "other");
	await rpc(mf, "create", ["Demo"]);
	const token = (await rpc(mf, "createToken", ["read"], "demo")) as {
		id: string;
	};
	await rpc(mf, "revokeToken", [token.id], "DEMO");
	await vi.waitFor(() => expect(delivered).toHaveLength(1), { timeout: 5000 });
	expect(delivered[0]).toMatchObject({
		type: "cf.artifacts.repo.token.revoked",
		source: { namespace: "examples", repoName: "Demo" },
		payload: { tokenId: token.id },
	});
	await new Promise((resolve) => setTimeout(resolve, 200));
	expect(delivered).toHaveLength(1);
});

test("fork events filter on the source repository", async ({ expect }) => {
	const { mf, delivered } = await startMiniflare([
		{
			type: "cf.artifacts.repo.forked",
			filter: { namespace: "examples", repoName: "source" },
		},
	]);
	await rpc(mf, "create", ["source"]);
	await rpc(mf, "create", ["unrelated"]);
	await rpc(mf, "fork", ["ignored"], "unrelated");
	await rpc(mf, "fork", ["copy"], "source");
	await vi.waitFor(() => expect(delivered).toHaveLength(1), { timeout: 5000 });
	expect(delivered[0]).toMatchObject({
		type: "cf.artifacts.repo.forked",
		source: { namespace: "examples", repoName: "source" },
		payload: { namespace: "examples", repoName: "copy" },
	});
});

test("a binding cannot configure events on another Worker's Workflow", async ({
	expect,
}) => {
	const { mf } = await createMiniflare([], (config) => {
		delete config.exports;
		config.env = {
			...config.env,
			ON_EVENT: {
				type: "workflow",
				name: "on-repo-event",
				worker: "another-worker",
				exportName: "OnRepoEvent",
				unsafeConfig: { events: [CREATED] },
			},
		};
	});
	onTestFinished(() => mf.dispose().catch(() => {}));
	await expect(mf.ready).rejects.toThrow(
		"cannot declare events for another Worker's Workflow"
	);
});
