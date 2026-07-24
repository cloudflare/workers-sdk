// flue-blueprint: sandbox/cloudflare-shell@3
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
} from "@cloudflare/shell";
import { stateTools } from "@cloudflare/shell/workers";
import {
	createEditTool,
	createReadTool,
	createWriteTool,
	type FileStat,
	type SandboxFactory,
	type SessionEnv,
	type SessionToolFactory,
	type ShellResult,
} from "@flue/runtime";
import { getCloudflareContext } from "@flue/runtime/cloudflare";

export interface GetShellSandboxOptions {
	executor?: Pick<
		DynamicWorkerExecutorOptions,
		"globalOutbound" | "modules" | "timeout"
	>;
	loader: WorkerLoader;
	workspace: Workspace;
}

export interface ShellSandboxEnv extends SessionEnv {
	readonly workspace: Workspace;
}

/**
 * Returns the native Cloudflare Shell workspace for this sandbox.
 */
export function shellWorkspace(sandbox: SessionEnv): Workspace {
	const workspace = (sandbox as Partial<ShellSandboxEnv>).workspace;
	if (!(workspace instanceof Workspace)) {
		throw new Error(
			"[flue] shellWorkspace() requires the Cloudflare Shell sandbox."
		);
	}
	return workspace;
}

/**
 * Creates a Flue sandbox backed by a durable Cloudflare Shell workspace.
 */
export function getShellSandbox(
	options: GetShellSandboxOptions
): SandboxFactory {
	if (!options?.workspace) {
		throw new Error(
			"[flue] getShellSandbox requires a workspace. Pass getDefaultWorkspace() for the common case."
		);
	}
	if (!options.loader) {
		throw new Error(
			"[flue] getShellSandbox requires a Worker Loader binding. Add worker_loaders to wrangler.jsonc and pass env.LOADER."
		);
	}

	const { executor: executorOptions, loader, workspace } = options;
	const fs = new WorkspaceFileSystem(workspace);
	const executor = new DynamicWorkerExecutor({
		loader,
		...executorOptions,
	});
	const stateProvider = resolveProvider(stateTools(workspace));
	const toolFactory: SessionToolFactory = (sessionEnv) => [
		createReadTool(sessionEnv),
		createWriteTool(sessionEnv),
		createEditTool(sessionEnv),
		createCodeTool(executor, stateProvider),
	];

	return {
		async createSessionEnv(): Promise<ShellSandboxEnv> {
			return {
				...createWorkspaceSessionEnv(workspace, fs, "/"),
				workspace,
			};
		},
		tools: toolFactory,
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
		mkdir: async (path, mkdirOptions) => {
			await fs.mkdir(resolvePath(path), mkdirOptions);
		},
		readdir: async (path) => fs.readdir(resolvePath(path)),
		readFile: async (path) => fs.readFile(resolvePath(path)),
		readFileBuffer: async (path) => fs.readFileBytes(resolvePath(path)),
		resolvePath,
		rm: async (path, rmOptions) => {
			await fs.rm(resolvePath(path), rmOptions);
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
	"[flue] The Cloudflare Shell sandbox does not support exec(). The code tool runs JavaScript " +
	"in an isolated Worker against the workspace. Use the file operations on harness.sandbox or " +
	"shellWorkspace(harness.sandbox) from application code. Use @cloudflare/sandbox when a real Linux environment is required.";

function adaptStat(stat: CfFsStat): FileStat {
	return {
		isDirectory: stat.type === "directory",
		isFile: stat.type === "file",
		isSymbolicLink: stat.type === "symlink",
		mtime: stat.mtime,
		size: stat.size,
	};
}

const CodeParams = {
	properties: {
		code: {
			description:
				"A string containing one self-contained async arrow function. Use plain JavaScript with no imports or Node.js APIs. Only state and standard JavaScript built-ins are available. Batch operations inside one function and return a JSON-serializable value.",
			type: "string",
		},
	},
	required: ["code"],
	type: "object",
};

const MAX_CONCURRENT_CODE_EXECUTIONS = 3;
let activeCodeExecutions = 0;
const codeExecutionWaiters: Array<() => void> = [];

async function withCodeExecutionSlot<T>(run: () => Promise<T>): Promise<T> {
	while (activeCodeExecutions >= MAX_CONCURRENT_CODE_EXECUTIONS) {
		await new Promise<void>((resolve) => codeExecutionWaiters.push(resolve));
	}
	activeCodeExecutions++;
	try {
		return await run();
	} finally {
		activeCodeExecutions--;
		codeExecutionWaiters.shift()?.();
	}
}

function createCodeTool(
	executor: DynamicWorkerExecutor,
	stateProvider: ResolvedProvider
) {
	return {
		description: buildCodeToolDescription(),
		async execute(_toolCallId: string, params: unknown) {
			const { code } = params as { code: string };
			const { error, logs, result } = await withCodeExecutionSlot(() =>
				executor.execute(code, [stateProvider])
			);
			if (error) {
				const logsTail = logs?.length ? `\n\nlogs:\n${logs.join("\n")}` : "";
				throw new Error(`code tool failed: ${error}${logsTail}`);
			}

			const resultText = formatResult(result);
			const logsText = logs?.length ? `\n\nlogs:\n${logs.join("\n")}` : "";

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
		parameters: CodeParams,
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
		"Run one JavaScript snippet in an isolated Worker against the durable workspace.",
		"The snippet must be one self-contained async arrow function:",
		"",
		"  async () => {",
		'    const text = await state.readFile("/notes.md");',
		'    await state.writeFile("/notes.md", text.toUpperCase());',
		"    return { bytes: text.length };",
		"  }",
		"",
		"Only state and standard JavaScript built-ins are available.",
		"Do not use imports, require, Node.js APIs, other agent tools, or network access.",
		"List directories before using paths, and do not guess file locations.",
		"Batch multiple operations inside one code call and return a JSON-serializable value.",
		"Prefer state.planEdits() with state.applyEditPlan() for multi-file edits.",
		"Prefer state.replaceInFiles() for transactional tree-wide replacements.",
		"",
		"The state API:",
		"",
		"```typescript",
		STATE_TYPES,
		"```",
	].join("\n");
}

/**
 * Returns the workspace backed by the current Flue Durable Object storage.
 */
export function getDefaultWorkspace(): Workspace {
	const { storage } = getCloudflareContext();
	return new Workspace({ sql: storage.sql as SqlStorage });
}
