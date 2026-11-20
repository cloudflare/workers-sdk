import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { Miniflare, Response } from "miniflare";
import { test, vi } from "vitest";
import { gitEnvironment } from "../../../src/plugins/artifacts/git-client";
import { singleModuleManifest, useDispose, useTmp } from "../../test-shared";
import type {
	ArtifactsEventMessage,
	ArtifactsEventType,
} from "../../../src/workers/artifacts/events";
import type { ArtifactsEventSubscription } from "@cloudflare/config";
import type { WorkerOptions } from "miniflare";

const exec = promisify(execFile);
const ZERO_OID = "0".repeat(40);
const WORKER_NAME = "artifacts-git-events";
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
    const { name } = await request.json();
    return Response.json(await env.REPOS.create(name));
  },
};
`;

async function startMiniflare(events: ArtifactsEventSubscription[]) {
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
	const tmp = await useTmp();
	const logs: string[] = [];
	const mf = new Miniflare({
		cf: false,
		// Internal Workers' logs, such as the namespace's, need verbose.
		verbose: true,
		handleStructuredLogs: ({ message }) => logs.push(message),
		resourcePersistencePath: path.join(tmp, "state"),
		workers: [{ config }],
	});
	useDispose(mf);
	await mf.ready;

	/** Creates a repository and returns a Git runner for a local clone of it. */
	async function createRepo(name: string) {
		const response = await mf.dispatchFetch("http://localhost", {
			method: "POST",
			body: JSON.stringify({ name }),
		});
		const { remote, token } = (await response.json()) as {
			remote: string;
			token: string;
		};
		const workdir = path.join(tmp, name);
		const git = async (args: string[], cwd = workdir) => {
			const { stdout } = await exec(
				"git",
				["-c", `http.extraHeader=Authorization: Bearer ${token}`, ...args],
				{
					cwd,
					env: {
						...gitEnvironment(),
						GIT_AUTHOR_NAME: "Dina",
						GIT_AUTHOR_EMAIL: "dina@example.test",
						GIT_COMMITTER_NAME: "Dina",
						GIT_COMMITTER_EMAIL: "dina@example.test",
					},
				}
			);
			return stdout.trim();
		};
		await git(["init", "--initial-branch=main", workdir], tmp);
		const commit = async (message: string) => {
			await git(["commit", "--allow-empty", "-m", message]);
			return git(["rev-parse", "HEAD"]);
		};
		return { remote, git, commit, tmp };
	}

	/** Warnings that an event was skipped; tests expect none. */
	const skippedEvents = () =>
		logs.filter((message) => message.includes("event skipped"));

	return { delivered, createRepo, skippedEvents };
}

function ofType<Type extends ArtifactsEventType>(
	delivered: ArtifactsEventMessage[],
	type: Type
): Extract<ArtifactsEventMessage, { type: Type }>[] {
	return delivered.filter(
		(message): message is Extract<ArtifactsEventMessage, { type: Type }> =>
			message.type === type
	);
}

const PUSHED: ArtifactsEventSubscription = { type: "cf.artifacts.repo.pushed" };

test("each ref a push changes starts a Workflow with the commits it added", async ({
	expect,
}) => {
	const { delivered, createRepo } = await startMiniflare([PUSHED]);
	const { remote, git, commit } = await createRepo("demo");
	const first = await commit("First commit");
	const second = await commit("Second commit");
	await git(["push", remote, "main"]);
	await vi.waitFor(() => expect(delivered).toHaveLength(1), {
		timeout: 10_000,
	});
	expect(delivered[0]).toMatchObject({
		type: "cf.artifacts.repo.pushed",
		source: { type: "artifacts.repo", namespace: "examples", repoName: "demo" },
		payload: {
			ref: "refs/heads/main",
			before: ZERO_OID,
			after: second,
			commits: [
				{
					id: second,
					message: "Second commit",
					messageTruncated: false,
					timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
					author: { name: "Dina", email: "dina@example.test" },
					committer: { name: "Dina", email: "dina@example.test" },
					parents: [first],
				},
				{ id: first, message: "First commit", parents: [] },
			],
			totalCommitsCount: 2,
			commitsTruncated: false,
		},
		metadata: {
			accountId: "local",
			eventSubscriptionId: expect.stringMatching(/^[0-9a-f]{32}$/),
			eventSchemaVersion: 1,
		},
	});

	// A branch update lists only the new commits; a tag lists none.
	const third = await commit("Third commit");
	await git(["tag", "v1"]);
	await git(["push", remote, "main", "refs/tags/v1"]);
	await vi.waitFor(() => expect(delivered).toHaveLength(3), {
		timeout: 10_000,
	});
	const byRef = Object.fromEntries(
		ofType(delivered.slice(1), "cf.artifacts.repo.pushed").map((message) => [
			message.payload.ref,
			message.payload,
		])
	);
	expect(byRef["refs/heads/main"]).toMatchObject({
		before: second,
		after: third,
		commits: [{ id: third, parents: [second] }],
		totalCommitsCount: 1,
		commitsTruncated: false,
	});
	expect(byRef["refs/tags/v1"]).toEqual({
		ref: "refs/tags/v1",
		before: ZERO_OID,
		after: third,
		commits: [],
		totalCommitsCount: 0,
		commitsTruncated: false,
	});

	// Deleting a ref publishes the zero ID as its new value.
	await git(["push", remote, ":refs/tags/v1"]);
	await vi.waitFor(() => expect(delivered).toHaveLength(4), {
		timeout: 10_000,
	});
	expect(delivered[3]?.payload).toEqual({
		ref: "refs/tags/v1",
		before: third,
		after: ZERO_OID,
		commits: [],
		totalCommitsCount: 0,
		commitsTruncated: false,
	});
});

test("a push of many commits lists the newest 20 and marks the rest left out", async ({
	expect,
}) => {
	const { delivered, createRepo } = await startMiniflare([PUSHED]);
	const { remote, git, commit } = await createRepo("demo");
	const hashes: string[] = [];
	for (let index = 1; index <= 25; index++) {
		hashes.push(await commit(`Commit ${index}`));
	}
	await git(["push", remote, "main"]);
	await vi.waitFor(() => expect(delivered).toHaveLength(1), {
		timeout: 10_000,
	});
	const [message] = ofType(delivered, "cf.artifacts.repo.pushed");
	expect(message?.payload.commits.map(({ id }) => id)).toEqual(
		hashes.slice(5).reverse()
	);
	// Production stops counting one past the listed commits.
	expect(message?.payload.totalCommitsCount).toBe(21);
	expect(message?.payload.commitsTruncated).toBe(true);
});

test("repository filters select pushes to one repository", async ({
	expect,
}) => {
	const { delivered, createRepo } = await startMiniflare([
		{ ...PUSHED, filter: { namespace: "examples", repoName: "Demo" } },
	]);
	const other = await createRepo("other");
	await other.commit("Other commit");
	await other.git(["push", other.remote, "main"]);
	const demo = await createRepo("demo");
	const head = await demo.commit("Demo commit");
	await demo.git(["push", demo.remote, "main"]);
	await vi.waitFor(() => expect(delivered).toHaveLength(1), {
		timeout: 10_000,
	});
	await new Promise((resolve) => setTimeout(resolve, 500));
	expect(delivered).toHaveLength(1);
	expect(delivered[0]).toMatchObject({
		source: { repoName: "demo" },
		payload: { after: head },
	});
});

test("clones and fetches start Workflows, but listing refs does not", async ({
	expect,
}) => {
	const { delivered, createRepo } = await startMiniflare([
		{ type: "cf.artifacts.repo.cloned" },
		{ type: "cf.artifacts.repo.fetched" },
	]);
	const { remote, git, commit, tmp } = await createRepo("demo");
	await commit("First commit");
	await git(["push", remote, "main"]);
	await git(["ls-remote", remote]);
	const clone = path.join(tmp, "clone");
	await git(["clone", remote, clone], tmp);
	await vi.waitFor(() => expect(delivered).toHaveLength(1), {
		timeout: 10_000,
	});
	expect(delivered[0]).toMatchObject({
		type: "cf.artifacts.repo.cloned",
		source: { type: "artifacts.repo", namespace: "examples", repoName: "demo" },
		payload: {},
	});

	// Protocol v0 sends its first want with capabilities appended.
	await git(["-c", "protocol.version=0", "clone", remote, `${clone}-v0`], tmp);
	await vi.waitFor(
		() => expect(ofType(delivered, "cf.artifacts.repo.cloned")).toHaveLength(2),
		{ timeout: 10_000 }
	);

	await commit("Second commit");
	await git(["push", remote, "main"]);
	await git(["fetch", "origin"], clone);
	await vi.waitFor(
		() =>
			expect(ofType(delivered, "cf.artifacts.repo.fetched")).not.toHaveLength(
				0
			),
		{ timeout: 10_000 }
	);
	expect(ofType(delivered, "cf.artifacts.repo.cloned")).toHaveLength(2);
	expect(ofType(delivered, "cf.artifacts.repo.fetched")[0]).toMatchObject({
		source: { repoName: "demo" },
		payload: {},
	});
});

test("concurrent pushes to one repository each publish only their own refs", async ({
	expect,
}) => {
	const { delivered, createRepo } = await startMiniflare([PUSHED]);
	const { remote, git, commit } = await createRepo("demo");
	await commit("Base commit");
	const branches = Array.from({ length: 6 }, (_, index) => `branch-${index}`);
	for (const branch of branches) {
		await git(["branch", branch]);
	}
	// Each push would also report the others' refs if it diffed against refs
	// read outside the repository lock.
	await Promise.all(
		branches.map((branch) => git(["push", remote, `refs/heads/${branch}`]))
	);
	await vi.waitFor(() => expect(delivered).toHaveLength(branches.length), {
		timeout: 10_000,
	});
	await new Promise((resolve) => setTimeout(resolve, 500));
	expect(
		ofType(delivered, "cf.artifacts.repo.pushed")
			.map((message) => message.payload.ref)
			.sort()
	).toEqual(branches.map((branch) => `refs/heads/${branch}`));
});

test("a rejected push publishes nothing and the next push still does", async ({
	expect,
}) => {
	const { delivered, createRepo } = await startMiniflare([PUSHED]);
	const { remote, git, commit } = await createRepo("demo");
	const first = await commit("First commit");
	await commit("Second commit");
	await git(["push", remote, "main"]);
	await vi.waitFor(() => expect(delivered).toHaveLength(1), {
		timeout: 10_000,
	});

	// Rewinding without --force is a non-fast-forward, which Git rejects.
	await git(["reset", "--hard", first]);
	const rewritten = await commit("Rewritten commit");
	await expect(git(["push", remote, "main"])).rejects.toThrow();
	await new Promise((resolve) => setTimeout(resolve, 500));
	expect(delivered).toHaveLength(1);

	await git(["push", "--force", remote, "main"]);
	await vi.waitFor(() => expect(delivered).toHaveLength(2), {
		timeout: 10_000,
	});
	// Like production, the walk ends only at `before`, so a rewrite lists
	// first-parent history that was already in the repository.
	expect(delivered[1]?.payload).toMatchObject({
		ref: "refs/heads/main",
		after: rewritten,
		commits: [{ id: rewritten, parents: [first] }, { id: first }],
		totalCommitsCount: 2,
	});
});

test("fetches large enough for Git to gzip the request still publish", async ({
	expect,
}) => {
	const { delivered, createRepo, skippedEvents } = await startMiniflare([
		{ type: "cf.artifacts.repo.fetched" },
	]);
	const { remote, git, commit, tmp } = await createRepo("demo");
	await commit("First commit");
	await git(["push", remote, "main"]);
	const clone = path.join(tmp, "clone");
	await git(["clone", remote, clone], tmp);
	// Local commits the server lacks become haves; Git gzips request bodies
	// over 1 KiB, and 40 haves take about 2 KiB.
	for (let index = 0; index < 40; index++) {
		await git(["commit", "--allow-empty", "-m", `Local ${index}`], clone);
	}
	await commit("Second commit");
	await git(["push", remote, "main"]);
	await git(["-c", "protocol.version=2", "fetch", "origin"], clone);
	await vi.waitFor(
		() =>
			expect(ofType(delivered, "cf.artifacts.repo.fetched")).not.toHaveLength(
				0
			),
		{ timeout: 10_000 }
	);
	// A fetch can take several requests; one that published would hide
	// another that failed to decode, so check that none did.
	expect(skippedEvents()).toEqual([]);
});
