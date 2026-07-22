// flue-blueprint: sandbox/cloudflare-shell@1
import {
	DynamicWorkerExecutor,
	resolveProvider,
	type DynamicWorkerExecutorOptions,
	type ResolvedProvider,
} from "@cloudflare/codemode";
import {
	STATE_TYPES,
	Workspace,
	WorkspaceFileSystem,
	type FsStat as CfFsStat,
	type SqlBackend,
	type SqlParam,
} from "@cloudflare/shell";
import { stateTools } from "@cloudflare/shell/workers";
import {
	type FileStat,
	type SandboxFactory,
	type SessionEnv,
	type SessionToolFactory,
	type ShellResult,
} from "@flue/runtime";
import { getCloudflareContext } from "@flue/runtime/cloudflare";

type AgentTool = ReturnType<SessionToolFactory>[number];

interface GetShellSandboxOptions {
	executor?: Pick<
		DynamicWorkerExecutorOptions,
		"globalOutbound" | "modules" | "timeout"
	>;
	loader: WorkerLoader;
	workspace: Workspace;
}

/**
 * Creates a Flue sandbox backed by a durable Cloudflare Shell workspace.
 *
 * The sandbox exposes Codemode's isolated `code` tool for workspace operations.
 * Linux command execution is unavailable, and network access is controlled by
 * the executor options.
 *
 * @param options - The Worker Loader binding, durable workspace, and optional
 * executor restrictions used by Codemode.
 *
 * @returns A factory that creates Flue sessions rooted at the workspace.
 */
export function getShellSandbox(
	options: GetShellSandboxOptions
): SandboxFactory {
	if (!options?.workspace) {
		throw new Error(
			"[flue] getShellSandbox requires a workspace. Pass `getDefaultWorkspace()` for the common case, " +
				"or construct your own with `new Workspace({ sql: ctx.storage.sql, ... })`."
		);
	}
	if (!options.loader) {
		throw new Error(
			"[flue] getShellSandbox requires a WorkerLoader binding. Add this to your wrangler.jsonc:\n" +
				'  { "worker_loaders": [{ "binding": "LOADER" }] }\n' +
				"Then pass `loader: env.LOADER` to getShellSandbox(). See " +
				"https://developers.cloudflare.com/dynamic-workers/."
		);
	}

	const { executor: executorOptions, loader, workspace } = options;
	const fs = new WorkspaceFileSystem(workspace);
	const executor = new DynamicWorkerExecutor({
		loader,
		...executorOptions,
	});
	const stateProvider = resolveProvider(stateTools(workspace));

	return {
		createSessionEnv: async () => createWorkspaceSessionEnv(workspace, fs, "/"),
		tools: () => [createCodeTool(executor, stateProvider)],
	};
}

function normalizePath(path: string): string {
	const parts = path.split("/");
	const result: string[] = [];
	for (const part of parts) {
		if (part === "." || part === "") {
			continue;
		}
		if (part === "..") {
			result.pop();
			continue;
		}
		result.push(part);
	}
	return `/${result.join("/")}`;
}

function createWorkspaceSessionEnv(
	workspace: Workspace,
	fs: WorkspaceFileSystem,
	cwd: string
): SessionEnv {
	const normalizedCwd = normalizePath(cwd);

	function resolvePath(path: string): string {
		if (path.startsWith("/")) {
			return normalizePath(path);
		}
		if (normalizedCwd === "/") {
			return normalizePath(`/${path}`);
		}
		return normalizePath(`${normalizedCwd}/${path}`);
	}

	function exec(): Promise<ShellResult> {
		throw new Error(EXEC_NOT_SUPPORTED_MESSAGE);
	}

	return {
		cwd: normalizedCwd,
		exec,
		exists: async (path) => fs.exists(resolvePath(path)),
		mkdir: async (path, options) => {
			await fs.mkdir(resolvePath(path), options);
		},
		readdir: async (path) => fs.readdir(resolvePath(path)),
		readFile: async (path) => fs.readFile(resolvePath(path)),
		readFileBuffer: async (path) => fs.readFileBytes(resolvePath(path)),
		resolvePath,
		rm: async (path, options) => {
			await fs.rm(resolvePath(path), options);
		},
		stat: async (path) => adaptStat(await fs.stat(resolvePath(path))),
		writeFile: async (path, content) => {
			const resolved = resolvePath(path);

			async function write(): Promise<void> {
				if (typeof content === "string") {
					await workspace.writeFile(resolved, content);
					return;
				}

				await workspace.writeFileBytes(resolved, content);
			}

			try {
				await write();
			} catch {
				const parent = resolved.slice(0, resolved.lastIndexOf("/")) || "/";
				await fs.mkdir(parent, { recursive: true });
				await write();
			}
		},
	};
}

const EXEC_NOT_SUPPORTED_MESSAGE =
	"[flue] The Cloudflare Shell sandbox does not support exec(). The agent's `code` tool runs JavaScript " +
	"in an isolated Worker against the workspace. From application code, use `session.fs` or `harness.fs`. " +
	"Use `@cloudflare/sandbox` only when a real Linux environment is required.";

function adaptStat(stat: CfFsStat): FileStat {
	return {
		isDirectory: stat.type === "directory",
		isFile: stat.type === "file",
		isSymbolicLink: stat.type === "symlink",
		mtime: stat.mtime,
		size: stat.size,
	};
}

function createCodeTool(
	executor: DynamicWorkerExecutor,
	stateProvider: ResolvedProvider
): AgentTool {
	return {
		description: buildCodeToolDescription(),
		execute: async (_toolCallId, params) => {
			const { code } = params as { code: string };
			const { error, logs, result } = await executor.execute(code, [
				stateProvider,
			]);
			if (error) {
				const logsTail = logs?.length ? `\n\nlogs:\n${logs.join("\n")}` : "";
				throw new Error(`code tool failed: ${error}${logsTail}`);
			}

			const resultText = formatResult(result);
			const logsText = logs?.length
				? `\n\n--- logs ---\n${logs.join("\n")}`
				: "";

			return {
				content: [
					{
						text: resultText + logsText,
						type: "text" as const,
					},
				],
				details: logs?.length ? { logs } : {},
			};
		},
		label: "Run Code",
		name: "code",
		parameters: {
			properties: {
				code: {
					description:
						"A single async arrow function with the signature `async () => { ... return result; }`. " +
						"Inside the body, call `state.*` to operate on the workspace. The function executes in " +
						"an isolated Worker with no network, DOM, or imports. Return a JSON-serializable value.",
					type: "string",
				},
			},
			required: ["code"],
			type: "object",
		},
	};
}

function formatResult(result: unknown): string {
	if (result === undefined) {
		return "(no result)";
	}
	if (typeof result === "string") {
		return result;
	}
	try {
		return JSON.stringify(result, null, 2);
	} catch {
		return String(result);
	}
}

function buildCodeToolDescription(): string {
	return [
		"Run JavaScript inside an isolated Worker against a durable workspace.",
		"The snippet must be a single async arrow function:",
		"",
		"  async () => {",
		'    const text = await state.readFile("/notes.md");',
		'    await state.writeFile("/notes.md", text.toUpperCase());',
		"    return { bytes: text.length };",
		"  }",
		"",
		"Rules:",
		"- Write JavaScript, not TypeScript.",
		"- Do not use imports. Everything available is exposed on `state`.",
		"- Always return the value that should be sent back.",
		"- Prefer `state.planEdits()` and `state.applyEditPlan()` for multi-file edits.",
		"- Prefer `state.replaceInFiles()` for transactional tree-wide replacements.",
		"- Network access is disabled.",
		"",
		"The `state` API:",
		"",
		"```typescript",
		STATE_TYPES,
		"```",
	].join("\n");
}

/**
 * Returns the default workspace backed by the current generated Durable
 * Object's SQLite storage.
 *
 * This must be called within a Flue-generated Durable Object context.
 *
 * @returns A durable Cloudflare Shell workspace scoped to the current object.
 */
export function getDefaultWorkspace(): Workspace {
	const { storage } = getCloudflareContext();
	return new Workspace({
		sql: createShellSqlBackend(storage.sql),
	});
}

function createShellSqlBackend(
	sql: ReturnType<typeof getCloudflareContext>["storage"]["sql"]
): SqlBackend {
	return {
		query<Row = Record<string, SqlParam>>(
			query: string,
			...params: SqlParam[]
		): Row[] {
			// Flue preserves the runtime cursor but intentionally erases its row type.
			return sql.exec(query, ...params).toArray() as Row[];
		},
		run(query: string, ...params: SqlParam[]): void {
			sql.exec(query, ...params);
		},
	};
}
