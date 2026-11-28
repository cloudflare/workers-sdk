export type MigrationBundler = "vite" | "wrangler";

export interface WranglerConfigMigrationOptions {
	dryRun?: boolean;
	/** Whether to migrate even if the Git worktree is not clean */
	force?: boolean;
}

export interface BundlerMigrationOptions {
	bundler?: MigrationBundler;
	dryRun?: boolean;
	/**
	 * The project's build output folder, relative to the Wrangler config, as detection reports it
	 * (`outputDir`). Detection uses the framework's default folder, not the one in its config. With
	 * Vite, a Wrangler assets directory that is this folder needs no follow-up.
	 */
	outputDir?: string;
	/** Whether to install cf and install or upgrade Vite plugin and Wrangler dependencies when needed. Required dependency changes become blocking follow-ups when false. */
	installDependencies?: boolean;
}

export interface MigrationFollowUp {
	blocking: boolean;
	code: string;
	docsUrl?: string;
	message: string;
	sourcePath?: string;
}

export interface MigrationResult {
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

/** A Wrangler config's Worker settings, which don't depend on the bundler. */
export interface ConvertedWranglerSettings {
	base: ConvertedBranch;
	environments: Map<string, ConvertedBranch>;
	followUps: MigrationFollowUp[];
	imports: Set<string>;
}

/** A Wrangler config's build settings for the bundler the project builds with. */
export interface ConvertedWranglerBuild {
	followUps: MigrationFollowUp[];
	toolingBase?: ConvertedBranch;
	toolingEnvironments: Map<string, ConvertedBranch>;
}

export type ConvertedWranglerConfig = ConvertedWranglerSettings &
	ConvertedWranglerBuild;
