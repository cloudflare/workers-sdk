export type MigrationBundler = "vite" | "wrangler";

export interface WranglerToCfMigrationOptions {
	bundler?: MigrationBundler;
	dryRun?: boolean;
	/** Whether to install cf and install or upgrade Vite plugin and Wrangler dependencies when needed. Required dependency changes become blocking follow-ups when false. */
	installDependencies?: boolean;
	/** The Worker settings of the framework set up for cf. Its entrypoint replaces the Wrangler config's; its other settings fill in what the Wrangler config doesn't set. */
	frameworkSettings?: Record<string, unknown>;
	/**
	 * The directory the framework builds its static assets into, relative to the Wrangler config's
	 * directory. A Wrangler assets directory matching it is dropped without a follow-up, because the
	 * framework's build covers it.
	 */
	frameworkAssetsDirectory?: string;
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
