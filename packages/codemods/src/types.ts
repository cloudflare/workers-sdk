export interface CodemodContext {
	cwd: string;
	dryRun: boolean;
	files?: string[];
}

/** Context for a single codemod within an ordered run. */
export interface RunContext extends CodemodContext {
	/** In-memory writes shared by an ordered codemod run. */
	stagedFiles: Map<string, string>;
}

export interface CodemodResult {
	changedFiles: string[];
}

export interface Codemod {
	name: string;
	aliases?: string[];
	description: string;
	run(context: RunContext): Promise<CodemodResult>;
}
