import type { CodemodResult } from "../../types";

export type MigrationBundler = "vite" | "wrangler";

export interface WranglerToCfMigrationOptions {
	bundler?: MigrationBundler;
	dryRun?: boolean;
	force?: boolean;
	installDependencies?: boolean;
}

export interface MigrationFollowUp {
	blocking: boolean;
	code: string;
	docsUrl?: string;
	message: string;
	sourcePath?: string;
}

export interface WranglerToCfMigrationResult extends CodemodResult {
	followUps: MigrationFollowUp[];
	status: "complete" | "needs-intervention";
}

export interface OutputComment {
	docsUrl?: string;
	message: string;
}

export interface OutputObject {
	kind: "object";
	properties: OutputProperty[];
	trailingComments?: OutputComment[];
}

export interface OutputCall {
	args: OutputValue[];
	callee: string;
	kind: "call";
}

export interface OutputProperty {
	comments?: OutputComment[];
	key: string;
	value: OutputValue;
}

export type OutputValue =
	| boolean
	| null
	| number
	| string
	| OutputCall
	| OutputObject
	| OutputValue[];

export interface ConvertedBranch {
	config: OutputObject;
	previewConfig?: OutputObject;
}

export interface ConvertedWranglerConfig {
	base: ConvertedBranch;
	environments: Map<string, ConvertedBranch>;
	followUps: MigrationFollowUp[];
	imports: Set<string>;
	toolingBase?: ConvertedBranch;
	toolingEnvironments: Map<string, ConvertedBranch>;
}
