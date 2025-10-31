export type AutoConfigDetails = {
	projectPath?: string; // the path to the project, defaults to cwd
	packageJson?: string; // the content of the project's package.json file (if any)
	configured: boolean; // wether the project is already configured (no autoconfig required)
	framework?: {
		// details about the detected framework (if any)
		name: "astro"; // the detected framework
		version: string; // the detected version of the framework
		mode: "static" | "fullstack"; // wether the framework is build used for static generation or a fullstack deployment
	};
	buildCommand?: string; // the build command used to build the project (if any)
	outputDir?: string; // the output directory (if no framework is used outputDir points to the raw assets files)
};
