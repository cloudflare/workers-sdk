import { Miniflare } from "miniflare";
import { expectTypeOf, test, vi } from "vitest";
import { V1 } from "../../../src/workers/artifacts/events";
import {
	ARTIFACTS_EVENT_INBOX_CLASS_NAME,
	ARTIFACTS_EVENT_INBOX_SERVICE_NAME,
} from "../../../src/workers/queues/constants";
import { singleModuleManifest, useDispose } from "../../test-shared";
import type { ArtifactsEvent } from "../../../src/workers/artifacts/events";

test("V1 constructors retain their event-specific types", ({ expect }) => {
	expect(Object.keys(V1)).toHaveLength(12);
	expectTypeOf<
		ReturnType<typeof V1.repoCreated>["type"]
	>().toEqualTypeOf<"repo.created.v1">();
	expectTypeOf<
		ReturnType<typeof V1.repoForked>["payload"]["forkedFrom"]
	>().toEqualTypeOf<{
		namespace: string;
		name: string;
	}>();
	expectTypeOf<
		ReturnType<
			typeof V1.repoPushed
		>["payload"]["push"]["commits"][number]["messageTruncated"]
	>().toEqualTypeOf<boolean>();
	expectTypeOf<
		ReturnType<typeof V1.tokenCreated>["payload"]["token"]
	>().toEqualTypeOf<{
		id: string;
		scope: string;
		expiresAt: string;
	}>();
});

const PRODUCER = `export default {
  async fetch(request, env) {
    const { method, args = [], name } = await request.json();
    try {
      const target = name === undefined ? env.REPOS : await env.REPOS.get(name);
      return Response.json(await target[method](...args));
    } catch (error) {
      return Response.json({ error: error.message, code: error.code }, { status: 400 });
    }
  }
};`;

test("publishes canonical events through the private Queue RPC ingress", async ({
	expect,
}) => {
	const mf = new Miniflare({
		cf: false,
		workers: [
			{
				config: {
					name: "producer",
					compatibilityDate: "2026-09-03",
					env: {
						REPOS: {
							type: "artifacts",
							namespace: "events",
							dev: { remote: false },
						},
					},
					manifest: singleModuleManifest(PRODUCER),
				},
			},
		],
	});
	useDispose(mf);
	async function call(method: string, args: unknown[] = [], name?: string) {
		const response = await mf.dispatchFetch("http://localhost", {
			method: "POST",
			body: JSON.stringify({ method, args, name }),
		});
		return { status: response.status, body: await response.json() };
	}

	const created = await call("create", ["repo"]);
	expect(created.status).toBe(200);
	const result = created.body as { id: string; token: string };
	expect((await call("create", ["repo"])).status).toBe(400);

	const token = await call("createToken", [], "repo");
	const { id: tokenId } = token.body as { id: string };
	expect((await call("revokeToken", [tokenId], "repo")).status).toBe(200);
	expect((await call("fork", ["copy"], "repo")).status).toBe(200);
	expect((await call("delete", ["repo"])).status).toBe(200);
	expect((await call("delete", ["copy"])).status).toBe(200);

	// The diagnostic inbox is not a Queue consumer and is not exposed to user Workers.
	const namespace = await mf._getInternalDurableObjectNamespace(
		"queues",
		ARTIFACTS_EVENT_INBOX_SERVICE_NAME,
		ARTIFACTS_EVENT_INBOX_CLASS_NAME
	);
	const stub = namespace.get(namespace.idFromName("events"));
	async function recentEvents(): Promise<ArtifactsEvent[]> {
		const response = await stub.fetch("http://localhost/recent-events");
		return (await response.json()) as ArtifactsEvent[];
	}
	await vi.waitFor(async () => expect(await recentEvents()).toHaveLength(8), {
		timeout: 10_000,
	});
	const events = await recentEvents();
	expect(events.map(({ type }) => type).sort()).toEqual(
		[
			"repo.deleted.v1",
			"repo.deleted.v1",
			"repo.created.v1",
			"repo.forked.v1",
			"token.created.v1",
			"token.created.v1",
			"token.created.v1",
			"token.revoked.v1",
		].sort()
	);
	expect(events.find(({ type }) => type === "repo.created.v1")).toMatchObject({
		envelopeVersion: 1,
		source: "artifacts",
		actor: { account: { tag: "local", internalId: "local" } },
		payload: { repo: { id: result.id, namespace: "events", name: "repo" } },
	});
	expect(events.find(({ type }) => type === "repo.forked.v1")).toMatchObject({
		payload: { repo: { name: "copy" }, forkedFrom: { name: "repo" } },
	});
	expect(
		events.some(
			(event) =>
				event.type === "token.created.v1" && event.payload.token.id === tokenId
		)
	).toBe(true);
	expect(events.find(({ type }) => type === "token.revoked.v1")).toMatchObject({
		payload: { token: { id: tokenId } },
	});
	expect(JSON.stringify(events)).not.toContain(result.token);
	expect(events.every(({ eventId }) => eventId.length > 0)).toBe(true);
});
