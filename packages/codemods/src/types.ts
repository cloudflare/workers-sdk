export interface CodemodContext {
	cwd: string;
	dryRun: boolean;
	files?: string[];
	/** In-memory writes shared by an ordered codemod run. */
	stagedFiles?: Map<string, string>;
}

export interface CodemodResult {
	changedFiles: string[];
}

export interface Codemod {
	category: string;
	name: string;
	aliases?: string[];
	description: string;
	run(context: CodemodContext): Promise<CodemodResult>;
}
