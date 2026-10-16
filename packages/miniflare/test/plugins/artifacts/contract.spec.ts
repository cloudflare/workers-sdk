import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { removeDir } from "@cloudflare/workers-utils/fs-helpers";
import { Miniflare } from "miniflare";
import { test } from "vitest";
import { gitEnvironment } from "../../../src/plugins/artifacts/git-client";
import { singleModuleManifest, useDispose } from "../../test-shared";
import { runScenarios } from "./contract/scenarios";
import type { Created, ArtifactsBinding } from "./contract/scenarios";

const exec = promisify(execFile);
const SCRIPT = `export default { fetch() { return new Response("contract"); } };`;

async function prepareLocalFixture(created: Created): Promise<void> {
	const source = await mkdtemp(path.join(tmpdir(), "artifacts-contract-"));
	const environment = {
		...gitEnvironment(),
		GIT_AUTHOR_NAME: "Fixture",
		GIT_AUTHOR_EMAIL: "fixture@example.test",
		GIT_COMMITTER_NAME: "Fixture",
		GIT_COMMITTER_EMAIL: "fixture@example.test",
		GIT_AUTHOR_DATE: "2020-01-02T03:04:05Z",
		GIT_COMMITTER_DATE: "2020-01-02T03:04:05Z",
	};
	const git = async (...args: string[]) =>
		exec("git", args, { cwd: source, env: environment });
	try {
		await git("init", "--initial-branch=main");
		await mkdir(path.join(source, "folder"));
		await writeFile(path.join(source, "hello.txt"), "hello artifacts\n");
		await writeFile(
			path.join(source, "bytes.bin"),
			new Uint8Array([0, 255, 128, 1])
		);
		await writeFile(path.join(source, "folder", "nested.txt"), "nested\n");
		await git("add", ".");
		await git("commit", "-m", "first");
		await writeFile(path.join(source, "second.txt"), "second\n");
		await git("add", ".");
		await git("commit", "-m", "second");
		// Keep the token out of argv, stderr, and test output. The child alone sees the header.
		const pushEnv = {
			...environment,
			GIT_CONFIG_COUNT: "2",
			GIT_CONFIG_KEY_1: "http.extraHeader",
			GIT_CONFIG_VALUE_1: `Authorization: Bearer ${created.token}`,
		};
		await exec("git", ["push", created.remote, "main"], {
			cwd: source,
			env: pushEnv,
		});
		await git("checkout", "-b", "feature");
		await writeFile(path.join(source, "feature.txt"), "feature\n");
		await git("add", ".");
		await git("commit", "-m", "feature");
		await exec("git", ["push", created.remote, "feature"], {
			cwd: source,
			env: pushEnv,
		});
	} finally {
		await removeDir(source);
	}
}

function local(): Miniflare {
	return new Miniflare({
		cf: false,
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2026-09-03",
					env: {
						REPOS: {
							type: "artifacts",
							namespace: "contract-local",
							dev: { remote: false },
						},
					},
					manifest: singleModuleManifest(SCRIPT),
				},
			},
		],
	});
}

test("shared Artifacts contract runs against the local RPC binding and cleans up", async ({
	expect,
}) => {
	const mf = local();
	useDispose(mf);
	const { REPOS } = await mf.getBindings<{ REPOS: ArtifactsBinding }>();
	const observations = await runScenarios(
		REPOS,
		"contract-test-",
		prepareLocalFixture
	);
	const find = (step: string) =>
		observations.find((item) => item.step === step);
	expect(observations.length).toBeGreaterThan(50);
	expect(find("file binary")).toMatchObject({
		outcome: "value",
		value: {
			blob: { type: "application/octet-stream", bytes: [0, 255, 128, 1] },
		},
	});
	expect(find("file text")).toMatchObject({
		outcome: "value",
		value: { blob: { type: "text/plain;charset=utf-8" } },
	});
	expect(find("duplicate case")).toMatchObject({ outcome: "error" });
	expect(find("retained after delete")).toMatchObject({ outcome: "error" });
	for (const kind of ["blob", "tree", "commit"]) {
		expect(find(`${kind} present`)).toMatchObject({ outcome: "value" });
		expect(find(`${kind} missing`)).toMatchObject({
			outcome: "value",
			value: null,
		});
		expect(find(`${kind} wrong type`)).toMatchObject({
			outcome: "value",
			value: null,
		});
	}
	expect(find("file missing ref")).toMatchObject({
		outcome: "value",
		value: null,
	});
	expect(find("file missing path")).toMatchObject({
		outcome: "value",
		value: null,
	});
	expect(find("list next page")).toMatchObject({ outcome: "value" });
	expect(find("token revoke wrong repo")).toMatchObject({
		outcome: "value",
		value: false,
	});
	expect(find("fork all feature")).toMatchObject({
		outcome: "value",
		value: { blob: { bytes: [...new TextEncoder().encode("feature\n")] } },
	});
	expect(find("fork main feature")).toMatchObject({
		outcome: "value",
		value: null,
	});
	expect((await REPOS.list()).total).toBe(0);
}, 90_000);

test("local contract scenarios refuse a nonempty namespace", async ({
	expect,
}) => {
	const mf = local();
	useDispose(mf);
	const { REPOS } = await mf.getBindings<{ REPOS: ArtifactsBinding }>();
	await REPOS.create("contract-test-main");
	await expect(
		runScenarios(REPOS, "contract-test-", prepareLocalFixture)
	).rejects.toThrow(/not empty/);
	expect((await REPOS.list()).total).toBe(1);
	await REPOS.delete("contract-test-main");
});
