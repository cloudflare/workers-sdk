import { test } from "vitest";
import {
	createArtifactsEvent,
	createPushedPayload,
	getArtifactsEventSourceType,
	getRefUpdates,
	getUploadPackEventType,
	listsPushedCommits,
	matchesArtifactsEventRoute,
	toArtifactsEventMessage,
	ZERO_OID,
} from "../../../src/workers/artifacts/events";
import type {
	ArtifactsEventRoute,
	BackendCommit,
} from "../../../src/workers/artifacts/events";

const repo = { namespace: "examples", repoName: "demo" };

function route(overrides: Partial<ArtifactsEventRoute>): ArtifactsEventRoute {
	return {
		id: "subscription",
		types: ["cf.artifacts.repo.token.revoked"],
		target: { type: "workflow", binding: "ARTIFACTS_EVENT_TARGET_0" },
		...overrides,
	};
}

test("events use the documented source for each event type", ({ expect }) => {
	expect(getArtifactsEventSourceType("cf.artifacts.repo.created")).toBe(
		"artifacts"
	);
	expect(getArtifactsEventSourceType("cf.artifacts.repo.pushed")).toBe(
		"artifacts.repo"
	);
	expect(getArtifactsEventSourceType("cf.artifacts.repo.token.revoked")).toBe(
		"artifacts.repo"
	);
});

test("messages carry the event and per-subscription metadata", ({ expect }) => {
	const event = createArtifactsEvent("cf.artifacts.repo.token.revoked", repo, {
		tokenId: "token",
	});

	expect(toArtifactsEventMessage(event, "subscription")).toEqual({
		type: "cf.artifacts.repo.token.revoked",
		source: { type: "artifacts.repo", ...repo },
		payload: { tokenId: "token" },
		metadata: {
			accountId: "local",
			eventSubscriptionId: "subscription",
			eventSchemaVersion: 1,
			eventTimestamp: event.timestamp,
		},
	});
});

test.for([
	{ published: "Demo", subscribed: "demo" },
	{ published: "demo", subscribed: "DEMO" },
	{ published: "Demo", subscribed: "dEmO" },
])(
	"routes match repository identity: $published / $subscribed",
	({ published, subscribed }, { expect }) => {
		const event = createArtifactsEvent(
			"cf.artifacts.repo.token.revoked",
			{
				...repo,
				repoName: published,
			},
			{ tokenId: "token" }
		);
		expect(
			matchesArtifactsEventRoute(route({ repoName: subscribed }), event)
		).toBe(true);
		expect(toArtifactsEventMessage(event, "subscription").source.repoName).toBe(
			published
		);
	}
);

test("routes match on event type and repository", ({ expect }) => {
	const event = createArtifactsEvent("cf.artifacts.repo.token.revoked", repo, {
		tokenId: "token",
	});

	expect(matchesArtifactsEventRoute(route({}), event)).toBe(true);
	expect(
		matchesArtifactsEventRoute(
			route({ types: ["cf.artifacts.repo.token.created"] }),
			event
		)
	).toBe(false);
	expect(matchesArtifactsEventRoute(route({ repoName: "other" }), event)).toBe(
		false
	);
});

const A = "a".repeat(40);
const B = "b".repeat(40);

test("pushes report each created, moved, and deleted ref", ({ expect }) => {
	expect(
		getRefUpdates(
			{ "refs/heads/main": A, "refs/heads/old": A, "refs/tags/v1": A },
			{ "refs/heads/main": B, "refs/heads/new": B, "refs/tags/v1": A }
		)
	).toEqual([
		{ ref: "refs/heads/main", before: A, after: B },
		{ ref: "refs/heads/new", before: ZERO_OID, after: B },
		{ ref: "refs/heads/old", before: A, after: ZERO_OID },
	]);
});

test("only branch updates that keep the branch list commits", ({ expect }) => {
	expect(
		listsPushedCommits({ ref: "refs/heads/main", before: A, after: B })
	).toBe(true);
	expect(
		listsPushedCommits({ ref: "refs/heads/main", before: A, after: ZERO_OID })
	).toBe(false);
	expect(
		listsPushedCommits({ ref: "refs/tags/v1", before: ZERO_OID, after: B })
	).toBe(false);
});

function commit(message: string): BackendCommit {
	return {
		hash: B,
		message,
		author: { name: "Dina", email: "dina@example.test" },
		committer: { name: "Dina", email: "dina@example.test" },
		parents: [A],
		committedAt: 1_700_000_000,
	};
}

test("push payloads bound commits and messages like production", ({
	expect,
}) => {
	const update = { ref: "refs/heads/main", before: A, after: B };
	// 4095 ASCII bytes then a 3-byte character: the cut must not split it.
	const long = `${"x".repeat(4095)}€ tail`;
	const payload = createPushedPayload(update, {
		commits: [commit(long), ...Array.from({ length: 21 }, () => commit("m"))],
		totalCount: 21,
	});
	expect(payload.commits).toHaveLength(20);
	expect(payload.commits[0]).toEqual({
		id: B,
		message: "x".repeat(4095),
		messageTruncated: true,
		timestamp: "2023-11-14T22:13:20.000Z",
		author: { name: "Dina", email: "dina@example.test" },
		committer: { name: "Dina", email: "dina@example.test" },
		parents: [A],
	});
	expect(payload.commits[1]?.messageTruncated).toBe(false);
	expect(payload.totalCommitsCount).toBe(21);
	expect(payload.commitsTruncated).toBe(true);
	expect(createPushedPayload({ ...update, ref: "refs/tags/v1" })).toEqual({
		ref: "refs/tags/v1",
		before: A,
		after: B,
		commits: [],
		totalCommitsCount: 0,
		commitsTruncated: false,
	});
});

/** Encodes Git pkt-lines; `null` is a flush packet and `"delim"` a delimiter. */
function pktLines(...lines: (string | null | "delim")[]): Uint8Array {
	return new TextEncoder().encode(
		lines
			.map((line) => {
				if (line === null) {
					return "0000";
				}
				if (line === "delim") {
					return "0001";
				}
				const data = `${line}\n`;
				return (data.length + 4).toString(16).padStart(4, "0") + data;
			})
			.join("")
	);
}

test("upload-pack requests publish clones and fetches, not ref listings", ({
	expect,
}) => {
	expect(
		getUploadPackEventType(pktLines("command=ls-refs", "delim", "peel", null))
	).toBeUndefined();
	expect(
		getUploadPackEventType(
			pktLines("command=fetch", "delim", `want ${A}`, "done", null)
		)
	).toBe("cf.artifacts.repo.cloned");
	expect(
		getUploadPackEventType(
			pktLines("command=fetch", "delim", `want ${A}`, `have ${B}`, "done", null)
		)
	).toBe("cf.artifacts.repo.fetched");
	// Protocol v1 has no command line.
	expect(
		getUploadPackEventType(pktLines(`want ${A} side-band-64k`, null, "done"))
	).toBe("cf.artifacts.repo.cloned");
	expect(
		getUploadPackEventType(new TextEncoder().encode("not a pkt-line"))
	).toBeUndefined();
});
