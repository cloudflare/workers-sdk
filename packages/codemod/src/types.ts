export interface CodemodContext {
	cwd: string;
	dryRun: boolean;
	files?: string[];
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
