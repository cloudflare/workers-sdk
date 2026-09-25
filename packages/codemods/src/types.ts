export interface CodemodContext {
	bundler?: "vite" | "wrangler";
	configPath?: string;
	cwd: string;
	dryRun: boolean;
	files?: string[];
	force?: boolean;
	installDependencies?: boolean;
}

export interface CodemodFollowUp {
	blocking: boolean;
	docsUrl?: string;
	message: string;
	sourcePath?: string;
}

/** Context for a single codemod within an ordered run. */
export interface RunContext extends CodemodContext {
	/** In-memory writes shared by an ordered codemod run. */
	stagedFiles: Map<string, string>;
}

export interface CodemodResult {
	changedFiles: string[];
	followUps?: CodemodFollowUp[];
	message?: string;
	requiresInstall?: boolean;
	status?: "complete" | "needs-intervention" | "skipped";
}

export interface Codemod {
	name: string;
	aliases?: string[];
	description: string;
	/** Whether the codemod enforces worktree safety after its own preflight. */
	managesGitWorktreeSafety?: boolean;
	run(context: RunContext): Promise<CodemodResult>;
}
