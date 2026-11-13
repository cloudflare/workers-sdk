import { test } from "vitest";
import {
	createArtifactsEvent,
	getArtifactsEventSourceType,
	matchesArtifactsEventRoute,
	toArtifactsEventMessage,
} from "../../../src/workers/artifacts/events";
import type { ArtifactsEventRoute } from "../../../src/workers/artifacts/events";

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
