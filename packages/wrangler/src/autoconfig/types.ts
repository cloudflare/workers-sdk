export type AutoConfigDetails = {
	/** The path to the project (defaults to cwd) */
	projectPath?: string;
	/** The content of the project's package.json file (if any) */
	packageJson?: string;
	/** Whether the project is already configured (no autoconfig required) */
	configured: boolean;
	/** Details about the detected framework (if any) */
	framework?: {
		/** The detected framework */
		name: "astro";
		/** The detected version of the framework */
		version: string;
		/** Whether the framework is used for static generation or fullstack deployment */
		mode: "static" | "fullstack";
	};
	/** The build command used to build the project (if any) */
	buildCommand?: string;
	/** The output directory (if no framework is used, points to the raw asset files) */
	outputDir?: string;
};
