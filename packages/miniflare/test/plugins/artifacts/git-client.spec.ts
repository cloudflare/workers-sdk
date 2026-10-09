import { execFile } from "node:child_process";
import {
	chmod,
	mkdir,
	readFile,
	readdir,
	stat,
	writeFile,
} from "node:fs/promises";
import { devNull } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { test } from "vitest";
import {
	assertGitAvailable,
	assertSupportedGitVersion,
	GitClient,
	gitEnvironment,
	runGit,
} from "../../../src/plugins/artifacts/git-client";
import { useTmp } from "../../test-shared";

const exec = promisify(execFile);

function git(args: string[], cwd?: string, extraEnv: NodeJS.ProcessEnv = {}) {
	return exec("git", args, {
		cwd,
		env: {
			...gitEnvironment(),
			...extraEnv,
			GIT_AUTHOR_NAME: "Miniflare",
			GIT_AUTHOR_EMAIL: "miniflare@example.com",
			GIT_COMMITTER_NAME: "Miniflare",
			GIT_COMMITTER_EMAIL: "miniflare@example.com",
		},
	});
}

test("Git subprocesses do not inherit Cloudflare or host credentials", ({
	expect,
}) => {
	const env = gitEnvironment({
		PATH: "/usr/bin",
		CLOUDFLARE_API_TOKEN: "production-secret",
		GIT_CONFIG_GLOBAL: "/home/user/.gitconfig",
		GIT_CONFIG_PARAMETERS: "'credential.helper=unsafe'",
		GIT_ASKPASS: "/home/user/askpass",
		GITHUB_TOKEN: "github-secret",
	});
	expect(env.PATH).toBe("/usr/bin");
	expect(env.CLOUDFLARE_API_TOKEN).toBeUndefined();
	expect(env.GIT_CONFIG_PARAMETERS).toBeUndefined();
	expect(env.GIT_ASKPASS).toBeUndefined();
	expect(env.GITHUB_TOKEN).toBeUndefined();
	expect(env.GIT_CONFIG_VALUE_0).toBe("");
	expect(env.GIT_CONFIG_COUNT).toBe("1");
	if (process.platform === "win32") {
		expect(env.GIT_CONFIG_GLOBAL).toContain("miniflare-artifacts-empty-");
	} else {
		expect(env.GIT_CONFIG_GLOBAL).toBe(devNull);
	}
});

test("Git version check accepts 2.32 and vendor versions, but rejects older Git", ({
	expect,
}) => {
	for (const output of [
		"git version 2.32.0",
		"git version 2.32.0.windows.1",
		"git version 2.39.5 (Apple Git-154)",
		"git version 3.0.0",
	]) {
		expect(() => assertSupportedGitVersion(output)).not.toThrow();
	}
	for (const output of [
		"git version 2.31.99",
		"git version 1.99.0",
		"not a Git version",
	]) {
		expect(() => assertSupportedGitVersion(output)).toThrow(
			/requires Git 2\.32 or newer.*Upgrade Git/
		);
	}
});

test.skipIf(process.platform === "win32")(
	"Git check suggests an upgrade before starting any repository operation",
	async ({ expect }) => {
		const root = await useTmp();
		const fakeGit = path.join(root, "git");
		await writeFile(fakeGit, "#!/bin/sh\nprintf 'git version 2.31.99\\n'\n");
		await chmod(fakeGit, 0o755);
		const previousPath = process.env.PATH;
		process.env.PATH = root;
		try {
			await expect(assertGitAvailable()).rejects.toThrow(
				/requires Git 2\.32 or newer.*Found git version 2\.31\.99.*Upgrade Git.*restart/i
			);
		} finally {
			process.env.PATH = previousPath;
		}
	}
);

test("Git client imports, reads and forks a local repository", async ({
	expect,
}) => {
	const directory = await useTmp();
	const source = path.join(directory, "source");
	await git(["init", "--initial-branch=main", source]);
	await writeFile(path.join(source, "hello.txt"), "hello artifacts\n");
	await git(["add", "."], source);
	await git(["commit", "-m", "fixture"], source);

	// The public binding accepts HTTPS; file:// tests native Git without network access.
	const imported = new GitClient(path.join(directory, "imported.git"));
	await imported.importFrom(pathToFileURL(source).href, "main", 1);
	await imported.configure("local-generation");
	expect(await imported.generation()).toBe("local-generation");
	expect((await imported.state()).defaultBranch).toBe("main");
	expect((await imported.readFile("main", "hello.txt"))?.data).toBe(
		Buffer.from("hello artifacts\n").toString("base64")
	);
	const commit = (await imported.log())[0];
	if (!commit) {
		throw new Error("Imported repository is missing its commit");
	}
	expect(commit.message).toBe("fixture");
	expect((await imported.readCommit(commit.hash))?.hash).toBe(commit.hash);
	expect(await imported.readTree(commit.treeHash)).toMatchObject([
		{ name: "hello.txt", mode: "100644", type: "blob" },
	]);
	await git(["tag", "-a", "v1", "-m", "release"], imported.repository);
	const tag = (
		await git(["rev-parse", "refs/tags/v1"], imported.repository)
	).stdout.trim();
	expect(await imported.readCommit(tag)).toBeNull();
	expect(await imported.readBlob(tag)).toBeNull();
	const blob = (
		await git(["rev-parse", "HEAD:hello.txt"], source)
	).stdout.trim();
	expect((await imported.readBlob(blob))?.data).toBe(
		Buffer.from("hello artifacts\n").toString("base64")
	);
	expect(
		(await git(["-C", imported.repository, "remote"], directory)).stdout
	).toBe("");

	const forked = new GitClient(path.join(directory, "forked.git"));
	await forked.forkFrom(imported, "main", true);
	expect((await forked.state()).refs["refs/heads/main"]).toBe(commit.hash);
});

test("Git import accepts a native local repository path", async ({
	expect,
}) => {
	const workspace = await useTmp();
	const source = path.join(workspace, "source.git");
	const target = path.join(workspace, "local.git");
	await git(["init", "--bare", source]);
	await new GitClient(target).importFrom(source);
	expect((await stat(target)).isDirectory()).toBe(true);
	expect((await git(["remote"], target)).stdout).toBe("");
});

test.skipIf(process.platform === "win32")(
	"Git import staging supports a long target component",
	async ({ expect }) => {
		const workspace = await useTmp();
		const source = path.join(workspace, "source.git");
		const target = path.join(workspace, "r".repeat(250));
		await git(["init", "--bare", source]);
		await new GitClient(target).importFrom(source);
		expect((await stat(target)).isDirectory()).toBe(true);
	}
);

test("failed imports discard partial clones without exposing URL credentials", async ({
	expect,
}) => {
	const repository = path.join(await useTmp(), "failed.git");
	const client = new GitClient(repository);
	const url = "https://reader:example-password@127.0.0.1:1/missing.git";
	let failure: unknown;
	try {
		await client.importFrom(url);
	} catch (error) {
		failure = error;
	}
	expect(String(failure)).toMatch(/Git import failed.*source URL/);
	expect(String(failure)).not.toContain("example-password");
	expect(String(failure)).not.toContain(url);
	await expect(stat(repository)).rejects.toMatchObject({ code: "ENOENT" });
});

test("failed imports never remove a pre-existing target", async ({
	expect,
}) => {
	const repository = path.join(await useTmp(), "existing.git");
	await mkdir(repository);
	const marker = path.join(repository, "keep.txt");
	await writeFile(marker, "keep me\n");
	await expect(
		new GitClient(repository).importFrom("https://127.0.0.1:1/missing.git")
	).rejects.toThrow("Git import target already exists");
	expect(await readFile(marker, "utf8")).toBe("keep me\n");
});

test.skipIf(process.platform === "win32")(
	"a concurrent repository is never removed by failed import cleanup",
	async ({ expect }) => {
		const workspace = await useTmp();
		const source = path.join(workspace, "source.git");
		const target = path.join(workspace, "target.git");
		const marker = path.join(target, "keep.txt");
		const ready = path.join(workspace, "clone-ready");
		const release = path.join(workspace, "clone-release");
		const bin = path.join(workspace, "bin");
		await git(["init", "--bare", source]);
		await mkdir(bin);
		const realGit = (await exec("which", ["git"])).stdout.trim();
		const wrapper = path.join(bin, "git");
		await writeFile(
			wrapper,
			`#!/bin/sh\ncase " $* " in\n  *" clone "*)\n    printf ready > '${ready}'\n    while [ ! -f '${release}' ]; do sleep 0.02; done\n    ;;\nesac\nexec '${realGit}' "$@"\n`
		);
		await chmod(wrapper, 0o755);

		const previousPath = process.env.PATH;
		process.env.PATH = `${bin}:${previousPath}`;
		const importing = new GitClient(target).importFrom(
			pathToFileURL(source).href
		);
		try {
			for (let attempt = 0; attempt < 250; attempt++) {
				if ((await readdir(workspace)).includes("clone-ready")) {
					break;
				}
				await delay(20);
			}
			expect(await readFile(ready, "utf8")).toBe("ready");
			await expect(
				new GitClient(target).importFrom(pathToFileURL(source).href)
			).rejects.toThrow(
				"Another local process is creating this Git repository"
			);
			await mkdir(target);
			await writeFile(marker, "keep me\n");
			await writeFile(release, "continue");
			await expect(importing).rejects.toThrow(
				"Git import target already exists"
			);
			expect(await readFile(marker, "utf8")).toBe("keep me\n");
			const remaining = await readdir(workspace);
			expect(
				remaining.some((name) => name.startsWith(".artifacts-import-"))
			).toBe(false);
			expect(
				remaining.some((name) => name.startsWith(".artifacts-create-"))
			).toBe(false);
		} finally {
			await writeFile(release, "continue");
			await importing.catch(() => {});
			process.env.PATH = previousPath;
		}
	}
);

test.skipIf(process.platform === "win32")(
	"Git clone sanitizes HTTPS credentials and preserves scp-style sources",
	async ({ expect }) => {
		const workspace = await useTmp();
		const bin = path.join(workspace, "bin");
		const cloneArgs = path.join(workspace, "clone-args");
		const configKey = path.join(workspace, "authorization-key");
		await mkdir(bin);
		const realGit = (await exec("which", ["git"])).stdout.trim();
		const wrapper = path.join(bin, "git");
		await writeFile(
			wrapper,
			`#!/bin/sh\nprintf '%s' "$*" > '${cloneArgs}'\nprintf '%s' "$GIT_CONFIG_KEY_1" > '${configKey}'\ncase " $* " in\n  *"git@example.invalid:team/repo.git"*) exit 1 ;;\nesac\nexec '${realGit}' "$@"\n`
		);
		await chmod(wrapper, 0o755);
		const previousPath = process.env.PATH;
		process.env.PATH = `${bin}:${previousPath}`;
		try {
			await expect(
				new GitClient(path.join(workspace, "failed.git")).importFrom(
					"https://reader:credential-canary@127.0.0.1:1/missing.git"
				)
			).rejects.toThrow("Git import failed");
			const args = await readFile(cloneArgs, "utf8");
			expect(args).toContain("https://127.0.0.1:1/missing.git");
			expect(args).not.toContain("credential-canary");
			expect(await readFile(configKey, "utf8")).toBe(
				"http.https://127.0.0.1:1/.extraHeader"
			);
			await expect(
				new GitClient(path.join(workspace, "scp.git")).importFrom(
					"git@example.invalid:team/repo.git"
				)
			).rejects.toThrow("Git import failed");
			expect(await readFile(cloneArgs, "utf8")).toContain(
				"git@example.invalid:team/repo.git"
			);
			expect(await readFile(configKey, "utf8")).toBe("");
		} finally {
			process.env.PATH = previousPath;
		}
	}
);

test("failed Git imports clean their target and hide URL credentials", async ({
	expect,
}) => {
	const repository = path.join(await useTmp(), "failed.git");
	let failure: unknown;
	try {
		await new GitClient(repository).importFrom(
			"https://reader:credential-canary@127.0.0.1:1/missing.git"
		);
	} catch (error) {
		failure = error;
	}
	expect(failure).toBeInstanceOf(Error);
	expect(String(failure)).toContain("Git import failed");
	expect(String(failure)).not.toContain("credential-canary");
	await expect(stat(repository)).rejects.toMatchObject({ code: "ENOENT" });
});

test("Git log rejects invalid pagination before starting a history read", async ({
	expect,
}) => {
	const client = new GitClient(path.join(await useTmp(), "empty.git"));
	await client.init("main");
	for (const limit of [-1, 0, 1001, 1.5, Number.POSITIVE_INFINITY]) {
		await expect(client.log("HEAD", limit)).rejects.toThrow(
			/Git log limit must be an integer between 1 and 1000/
		);
	}
	for (const offset of [-1, 1.5, Number.POSITIVE_INFINITY]) {
		await expect(client.log("HEAD", 1, offset)).rejects.toThrow(
			/Git log offset must be a non-negative integer/
		);
	}
});

test("Git commands override repository-local hooksPath configuration", async ({
	expect,
}) => {
	const root = await useTmp();
	const target = path.join(root, "target.git");
	const hooks = path.join(root, "host-hooks");
	await new GitClient(target).init("main");
	await git(["-C", target, "config", "core.hooksPath", hooks]);
	const result = await runGit([
		"-C",
		target,
		"config",
		"--get",
		"core.hooksPath",
	]);
	const effective = result.stdout.toString().trim();
	expect(effective).toContain("miniflare-artifacts-no-hooks-");
	expect(effective).not.toBe(hooks);
});

test("Git client reads pre-1970 commit timestamps", async ({ expect }) => {
	const directory = await useTmp();
	const repository = path.join(directory, "history");
	await git(["init", "--initial-branch=main", repository]);
	const tree = (await git(["write-tree"], repository)).stdout.trim();
	const commitFile = path.join(directory, "negative-date-commit");
	await writeFile(
		commitFile,
		`tree ${tree}\nauthor Ada <ada@example.test> -1 +0000\ncommitter Ada <ada@example.test> -1 +0000\n\nbefore epoch\n`
	);
	// Git's object writer rejects negative dates by default, but readers must
	// still accept existing commit objects with those header values.
	const hash = (
		await git(
			["hash-object", "--literally", "-t", "commit", "-w", commitFile],
			repository
		)
	).stdout.trim();
	await git(["update-ref", "refs/heads/main", hash], repository);
	const client = new GitClient(repository);
	expect(await client.readCommit(hash)).toMatchObject({
		authoredAt: -1,
		committedAt: -1,
	});
	expect(await client.log()).toMatchObject([{ hash, authoredAt: -1 }]);
});

test("Git reads HEAD, named and qualified refs without evaluating revision expressions", async ({
	expect,
}) => {
	const root = await useTmp();
	const source = path.join(root, "source");
	await git(["init", "--initial-branch=main", source]);
	await writeFile(path.join(source, "README"), "first\n");
	await git(["add", "README"], source);
	await git(["commit", "-m", "first"], source);
	await writeFile(path.join(source, "README"), "second\n");
	await git(["add", "README"], source);
	await git(["commit", "-m", "second"], source);
	await git(["tag", "release"], source);
	const client = new GitClient(path.join(root, "imported.git"));
	await client.importFrom(pathToFileURL(source).href);
	for (const ref of [
		"main",
		"HEAD",
		"refs/heads/main",
		"release",
		"refs/tags/release",
	]) {
		expect((await client.readFile(ref, "README"))?.data).toBe(
			Buffer.from("second\n").toString("base64")
		);
		expect((await client.log(ref))[0]?.message).toBe("second");
	}
	for (const ref of ["main~1", "main^{commit}", "refs/heads/main~1"]) {
		expect(await client.readFile(ref, "README")).toBeNull();
		expect(await client.log(ref)).toEqual([]);
	}
});

test("Git log follows the first-parent chain through merges", async ({
	expect,
}) => {
	const directory = await useTmp();
	const repository = path.join(directory, "merged");
	await git(["init", "--initial-branch=main", repository]);
	await writeFile(path.join(repository, "base.txt"), "base\n");
	await git(["add", "."], repository);
	await git(["commit", "-m", "base"], repository);
	await git(["checkout", "-b", "feature"], repository);
	await writeFile(path.join(repository, "feature.txt"), "feature\n");
	await git(["add", "."], repository);
	await git(["commit", "-m", "feature"], repository);
	const feature = (await git(["rev-parse", "HEAD"], repository)).stdout.trim();
	await git(["checkout", "main"], repository);
	await writeFile(path.join(repository, "main.txt"), "main\n");
	await git(["add", "."], repository);
	await git(["commit", "-m", "main"], repository);
	await git(["merge", "--no-ff", "-m", "merge", "feature"], repository);
	const expected = (
		await git(["rev-list", "--first-parent", "HEAD"], repository)
	).stdout
		.trim()
		.split("\n");
	const history = await new GitClient(repository).log();
	expect(history.map((commit) => commit.hash)).toEqual(expected);
	expect(history.map((commit) => commit.hash)).not.toContain(feature);
});
