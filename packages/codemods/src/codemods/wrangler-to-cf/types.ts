export type MigrationBundler = "vite" | "wrangler";

export interface WranglerToCfMigrationOptions {
	bundler?: MigrationBundler;
	dryRun?: boolean;
	force?: boolean;
	/** Whether to install cf and install or upgrade Vite plugin and Wrangler dependencies when needed. Required dependency changes become blocking follow-ups when false. */
	installDependencies?: boolean;
	/**
	 * Whether the caller sets up the Vite project, as autoconfig's framework setup does, when the Vite bundler is selected.
	 * The Cloudflare Vite plugin is then not installed unless the project already declares it, and the Wrangler assets directory is dropped without a follow-up because the Vite project configures its static assets.
	 */
	skipViteSetup?: boolean;
}

export interface MigrationFollowUp {
	blocking: boolean;
	code: string;
	docsUrl?: string;
	message: string;
	sourcePath?: string;
}

export interface WranglerToCfMigrationResult {
	changedFiles: string[];
	followUps: MigrationFollowUp[];
	requiresInstall: boolean;
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
