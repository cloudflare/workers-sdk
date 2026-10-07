import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Miniflare } from "miniflare";
import { test } from "vitest";
import { GitClient, runGit } from "../../../src/plugins/artifacts/git-client";
import { startGitSidecar } from "../../../src/plugins/artifacts/git-sidecar";
import {
	assertSupportedGitLayout,
	repositoryDirectory,
	repositoryPath,
} from "../../../src/plugins/artifacts/storage";
import { singleModuleManifest, useDispose, useTmp } from "../../test-shared";

const namespace = "namespace-with-a-long-name-for-platform-testing";

test("artifacts: repository paths are compact, deterministic and namespace-scoped", ({
	expect,
}) => {
	const directory = repositoryDirectory(namespace, "repo");
	expect(directory).toMatch(/^[0-9a-f]{32}\.git$/);
	expect(repositoryDirectory(namespace, "repo")).toBe(directory);
	expect(repositoryDirectory("other", "repo")).not.toBe(directory);
	expect(repositoryDirectory(namespace, "other")).not.toBe(directory);
	expect(repositoryDirectory("ab", "c")).not.toBe(
		repositoryDirectory("a", "bc")
	);
	expect(repositoryDirectory("../namespace", "../repo")).toMatch(
		/^[0-9a-f]{32}\.git$/
	);
});

test("artifacts: sidecar rejects legacy storage without removing it", async ({
	expect,
}) => {
	const root = await useTmp();
	const legacy = path.join(root, "a".repeat(64));
	await mkdir(legacy);
	await writeFile(path.join(legacy, "sentinel"), "preserve me");
	await expect(startGitSidecar(root)).rejects.toThrow(
		/older draft layout.*Back up/
	);
	expect(await readFile(path.join(legacy, "sentinel"), "utf8")).toBe(
		"preserve me"
	);
});

test("artifacts: legacy metadata layout is detected without resetting it", async ({
	expect,
}) => {
	const root = await useTmp();
	const id = createHash("sha256").update(namespace).digest("hex").slice(0, 32);
	const metadata = path.join(root, "artifacts", id, "metadata");
	const legacy = path.join(metadata, `artifacts-${id}`);
	await mkdir(legacy, { recursive: true });
	await writeFile(path.join(legacy, "sentinel"), "preserve me");
	await expect(assertSupportedGitLayout(metadata)).rejects.toThrow(
		/older draft layout.*Back up/
	);
	expect(await readFile(path.join(legacy, "sentinel"), "utf8")).toBe(
		"preserve me"
	);
});

test("artifacts: namespace metadata and Git data survive restart under paths with spaces", async ({
	expect,
}) => {
	const root = path.join(await useTmp(), "development project");
	const config = {
		name: "test",
		compatibilityDate: "2026-09-03",
		env: { REPOS: { type: "artifacts" as const, namespace } },
		manifest: singleModuleManifest(
			`export default { fetch() { return new Response("ok"); } };`
		),
	};
	type Bindings = {
		REPOS: {
			create(
				name: string
			): Promise<{ id: string; remote: string; token: string }>;
			get(name: string): Promise<{ info(): Promise<{ id: string }> }>;
		};
	};
	const options = {
		cf: false as const,
		resourcePersistencePath: root,
		workers: [{ config }],
	};
	const first = new Miniflare(options);
	useDispose(first);
	const { REPOS } = await first.getBindings<Bindings>();
	const created = await REPOS.create("repo");
	const id = created.id;
	await first.dispose();

	const second = new Miniflare(options);
	useDispose(second);
	const restarted = await second.getBindings<Bindings>();
	expect(await (await restarted.REPOS.get("repo")).info()).toMatchObject({
		id,
	});
	const namespaces = await readdir(path.join(root, "artifacts"));
	expect(namespaces).toHaveLength(1);
	const persisted = path.join(root, "artifacts", namespaces[0]);
	expect(await readdir(path.join(persisted, "git"))).toEqual([
		repositoryDirectory(namespace, "repo"),
	]);
	expect(
		(await readdir(path.join(persisted, "metadata"))).length
	).toBeGreaterThan(0);
});

test("artifacts: long Git storage roots can initialize and repack repositories", async ({
	expect,
}) => {
	const workspace = await useTmp();
	const root = path.join(workspace, "project with spaces " + "x".repeat(32));
	const sidecar = await startGitSidecar(root);
	try {
		const response = await fetch(
			`http://${sidecar.address}/__local_artifacts__`,
			{
				method: "POST",
				headers: { "X-Local-Artifacts-Backend": sidecar.secret },
				body: JSON.stringify({
					action: "create",
					namespace,
					name: "repo",
					generation: "test-generation",
				}),
			}
		);
		const body = await response.text();
		expect(response.status, body).toBe(200);
		const repository = repositoryPath(root, namespace, "repo");
		const source = path.join(workspace, "source");
		await runGit(["init", "--initial-branch=main", source]);
		await writeFile(path.join(source, "README"), "long-path regression\n");
		await runGit(["-C", source, "add", "README"]);
		await runGit([
			"-C",
			source,
			"-c",
			"user.name=Test",
			"-c",
			"user.email=test@example.com",
			"commit",
			"-m",
			"fixture",
		]);
		await runGit(["-C", source, "push", repository, "main"]);
		await runGit(["-C", repository, "repack", "-ad"]);
		expect(
			(await readdir(path.join(repository, "objects", "pack"))).some((file) =>
				file.endsWith(".pack")
			)
		).toBe(true);
		expect(await new GitClient(repository).generation()).toBe(
			"test-generation"
		);
	} finally {
		await sidecar.close();
	}
});
