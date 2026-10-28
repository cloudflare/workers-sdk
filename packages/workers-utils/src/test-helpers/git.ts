import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

/** Variables host Git needs to run; everything else is dropped. */
const INHERITED_ENV_KEYS = [
	"PATH",
	"SystemRoot",
	"WINDIR",
	"PATHEXT",
	"TMP",
	"TEMP",
	"TMPDIR",
	"LANG",
];

/**
 * Builds an environment for running host Git in tests without inheriting
 * system or global Git config, credential helpers, or Cloudflare credentials.
 *
 * @param directory - Directory used for the (absent) global Git config file
 * @returns Environment variables for `child_process` calls to `git`
 */
function isolatedGitEnv(directory: string): NodeJS.ProcessEnv {
	const inherited = Object.fromEntries(
		INHERITED_ENV_KEYS.map((key) => [key, process.env[key]])
	);
	return {
		...inherited,
		GIT_AUTHOR_NAME: "Example",
		GIT_AUTHOR_EMAIL: "example@example.invalid",
		GIT_COMMITTER_NAME: "Example",
		GIT_COMMITTER_EMAIL: "example@example.invalid",
		GIT_CONFIG_NOSYSTEM: "1",
		// Git for Windows cannot use /dev/null as a global config file.
		GIT_CONFIG_GLOBAL: path.join(directory, "absent-global-gitconfig"),
		GIT_CONFIG_COUNT: "1",
		GIT_CONFIG_KEY_0: "credential.helper",
		GIT_CONFIG_VALUE_0: "",
		GIT_TERMINAL_PROMPT: "0",
	};
}

/**
 * Commits `files` to a new `main` branch in `directory` and pushes it to
 * `remote` with host Git, authenticating with a bearer `token`.
 */
export async function pushGitFixture({
	directory,
	remote,
	token,
	files,
}: {
	directory: string;
	remote: string;
	token: string;
	files: Record<string, string>;
}): Promise<void> {
	// Resolve `execFile` per call: suites importing these helpers may mock
	// `node:child_process` without it, and module-load access would throw.
	const execFileAsync = promisify(execFile);
	const env = isolatedGitEnv(directory);
	await mkdir(directory, { recursive: true });
	await execFileAsync("git", ["init", "--initial-branch=main", directory], {
		env,
	});
	for (const [name, contents] of Object.entries(files)) {
		await writeFile(path.join(directory, name), contents);
	}
	const options = { cwd: directory, env };
	await execFileAsync("git", ["add", ...Object.keys(files)], options);
	await execFileAsync("git", ["commit", "-m", "fixture"], options);
	await execFileAsync(
		"git",
		[
			"-c",
			`http.extraHeader=Authorization: Bearer ${token}`,
			"push",
			remote,
			"main",
		],
		options
	);
}
