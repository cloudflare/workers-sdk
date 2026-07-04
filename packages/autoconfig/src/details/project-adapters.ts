import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, readdir } from "node:fs/promises";
import {
	basename,
	dirname,
	extname,
	join,
	relative,
	resolve,
	sep,
} from "node:path";
import {
	BunPackageManager,
	FatalError,
	getTodaysCompatDate,
	getWorkerName,
	NpmPackageManager,
	parsePackageJSON,
	PnpmPackageManager,
	readFileSync,
	YarnPackageManager,
} from "@cloudflare/workers-utils";
import { usesTypescript } from "../uses-typescript";
import type { AutoConfigContext } from "../context";
import type {
	AutoConfigDetailsForNonConfiguredProject,
	ConfigurationPlan,
	DeployIntent,
	DetectionConfidence,
	SourceCategory,
} from "../types";
import type {
	PackageJSON,
	PackageManager,
	RawConfig,
} from "@cloudflare/workers-utils";

type DetectionInput = {
	projectPath: string;
	wranglerConfigPath?: string;
	context: AutoConfigContext;
	deployIntent?: DeployIntent;
};

type ProjectAdapterDetectionInput = DetectionInput & {
	packageJson?: PackageJSON;
	packageManager: PackageManager;
};

type SourceCandidate = {
	absolutePath: string;
	projectPath: string;
	packageJson?: PackageJSON;
	packageManager: PackageManager;
	context: AutoConfigContext;
};

const SOURCE_CANDIDATE_FILES = [
	"index.js",
	"index.mjs",
	"index.cjs",
	"index.ts",
	"server.js",
	"server.mjs",
	"server.cjs",
	"server.ts",
	"app.js",
	"app.mjs",
	"app.cjs",
	"app.ts",
	"src/index.js",
	"src/index.mjs",
	"src/index.cjs",
	"src/index.ts",
	"src/server.js",
	"src/server.mjs",
	"src/server.cjs",
	"src/server.ts",
	"src/app.js",
	"src/app.mjs",
	"src/app.cjs",
	"src/app.ts",
];

export function getPackageManager(projectPath: string): PackageManager {
	if (existsSync(join(projectPath, "pnpm-lock.yaml"))) {
		return PnpmPackageManager;
	}
	if (existsSync(join(projectPath, "yarn.lock"))) {
		return YarnPackageManager;
	}
	if (
		existsSync(join(projectPath, "bun.lock")) ||
		existsSync(join(projectPath, "bun.lockb"))
	) {
		return BunPackageManager;
	}
	return NpmPackageManager;
}

export function readPackageJson(projectPath: string): PackageJSON | undefined {
	const packageJsonPath = resolve(projectPath, "package.json");
	try {
		return parsePackageJSON(readFileSync(packageJsonPath), packageJsonPath);
	} catch {
		return undefined;
	}
}

export async function detectProjectAdapter(
	input: DetectionInput
): Promise<AutoConfigDetailsForNonConfiguredProject | undefined> {
	const packageJson = readPackageJson(input.projectPath);
	const packageManager = getPackageManager(input.projectPath);
	const adapterInput = { ...input, packageJson, packageManager };

	if (input.deployIntent?.trigger === "explicit-target") {
		return await detectExplicitTarget(adapterInput);
	}

	return await detectBareOrSetupProject(adapterInput);
}

async function detectExplicitTarget(
	input: ProjectAdapterDetectionInput
): Promise<AutoConfigDetailsForNonConfiguredProject | undefined> {
	const target = input.deployIntent?.originalTarget;
	if (!target) {
		return undefined;
	}

	const targetPath = resolve(input.projectPath, target);
	const targetStats = statSync(targetPath, { throwIfNoEntry: false });
	if (!targetStats) {
		return undefined;
	}

	if (targetStats.isFile()) {
		if (isHtmlFile(targetPath)) {
			return createSingleFileSiteDetails(input, targetPath);
		}

		if (isDockerfileName(targetPath)) {
			return await detectContainer(input, targetPath, "high");
		}

		if (isJavaScriptOrTypeScriptFile(targetPath)) {
			return await detectNodeHttpServerFromSource({
				absolutePath: targetPath,
				projectPath: input.projectPath,
				packageJson: input.packageJson,
				packageManager: input.packageManager,
				context: input.context,
			});
		}

		return undefined;
	}

	if (
		!targetStats.isDirectory() ||
		!input.deployIntent?.staticAssetsAutoConfig
	) {
		return undefined;
	}

	const targetPackageJson = readPackageJson(targetPath);
	if (targetPackageJson) {
		const targetPackageManager = getPackageManager(targetPath);
		const staticAppDetails = await detectStaticPackageApp({
			...input,
			projectPath: targetPath,
			packageJson: targetPackageJson,
			packageManager: targetPackageManager,
		});
		if (staticAppDetails) {
			return staticAppDetails;
		}
	}

	if (await hasIndexHtml(targetPath)) {
		return createStaticAssetsDetails(input, targetPath);
	}

	return undefined;
}

async function detectBareOrSetupProject(
	input: ProjectAdapterDetectionInput
): Promise<AutoConfigDetailsForNonConfiguredProject | undefined> {
	const containerDetails = await detectRootContainer(input);
	if (containerDetails) {
		return containerDetails;
	}

	return await detectNodeHttpServerProject(input);
}

function createSingleFileSiteDetails(
	input: ProjectAdapterDetectionInput,
	sourcePath: string
): AutoConfigDetailsForNonConfiguredProject {
	return createAdapterDetails(input, {
		adapterId: "single-file-site",
		adapterName: "Single file site",
		projectKind: "single-file-site",
		confidence: "high",
		sourceCategory: "html-file",
		evidence: ["explicit html file target"],
		plan: {
			mode: "no-write",
			generatedFiles: ["temporary-assets-directory"],
			deploy: {
				generatedAssetsDirectory: "temporary",
			},
		},
		deployTarget: {
			type: "single-html-file",
			sourcePath,
		},
	});
}

function createStaticAssetsDetails(
	input: ProjectAdapterDetectionInput,
	assetsDirectory: string
): AutoConfigDetailsForNonConfiguredProject {
	return createAdapterDetails(input, {
		adapterId: "static-assets",
		adapterName: "Static assets",
		projectKind: "static-assets",
		confidence: "high",
		sourceCategory: "directory",
		evidence: ["explicit directory target contains index.html"],
		outputDir: relativeOrDot(input.projectPath, assetsDirectory),
		plan: {
			mode: "no-write",
			deploy: {
				assets: assetsDirectory,
				generatedAssetsDirectory: "existing",
			},
		},
		deployTarget: {
			type: "assets-directory",
			assetsDirectory,
		},
	});
}

async function detectStaticPackageApp(
	input: ProjectAdapterDetectionInput
): Promise<AutoConfigDetailsForNonConfiguredProject | undefined> {
	const buildScript = input.packageJson?.scripts?.build;
	if (!buildScript || !hasDependency(input.packageJson, "vite")) {
		return undefined;
	}

	const outputDir = resolve(input.projectPath, "dist");
	return createAdapterDetails(input, {
		adapterId: "static-package-app",
		adapterName: "Static package app",
		projectKind: "static-assets",
		confidence: existsSync(join(outputDir, "index.html")) ? "high" : "medium",
		sourceCategory: "package-app",
		evidence: [
			"package.json has vite dependency",
			"package.json has build script",
		],
		outputDir: "dist",
		plan: {
			mode: "no-write",
			commands: [
				{
					command: `${input.packageManager.type} run build`,
					when: "build",
					label: "build",
				},
			],
			deploy: {
				assets: outputDir,
				generatedAssetsDirectory: "build-output",
			},
		},
		deployTarget: {
			type: "static-app-output",
			assetsDirectory: outputDir,
		},
	});
}

async function detectNodeHttpServerProject(
	input: ProjectAdapterDetectionInput
): Promise<AutoConfigDetailsForNonConfiguredProject | undefined> {
	for (const candidate of SOURCE_CANDIDATE_FILES) {
		const absolutePath = resolve(input.projectPath, candidate);
		const stats = statSync(absolutePath, { throwIfNoEntry: false });
		if (stats?.isFile()) {
			const details = await detectNodeHttpServerFromSource({
				absolutePath,
				projectPath: input.projectPath,
				packageJson: input.packageJson,
				packageManager: input.packageManager,
				context: input.context,
			});
			if (details) {
				return details;
			}
		}
	}

	return undefined;
}

async function detectNodeHttpServerFromSource({
	absolutePath,
	projectPath,
	packageJson,
	packageManager,
	context,
}: SourceCandidate): Promise<
	AutoConfigDetailsForNonConfiguredProject | undefined
> {
	const source = await readFile(absolutePath, "utf8");
	const analysis = analyzeNodeHttpServerSource(source);
	const hasExpressDependency = hasDependency(packageJson, "express");
	const isExpressApp =
		analysis.hasExpressImport ||
		analysis.hasExpressFactory ||
		hasExpressDependency;

	if (!isExpressApp || !(analysis.hasListen || analysis.exportsApp)) {
		return undefined;
	}

	const port = analysis.port ?? 3000;
	const language = shouldGenerateTypescript(projectPath, absolutePath)
		? "ts"
		: "js";
	const wrapperPath = `src/worker.${language}`;
	const importSpecifier = getImportSpecifier(
		resolve(projectPath, wrapperPath),
		absolutePath
	);
	const wrapperContents = createNodeHttpServerWrapper({
		importSpecifier,
		port,
		hasListen: analysis.hasListen,
		language,
	});
	const wranglerConfig = {
		$schema: "node_modules/wrangler/config-schema.json",
		name: getWorkerName(packageJson?.name, projectPath),
		main: wrapperPath,
		compatibility_date: getTodaysCompatDate(),
		compatibility_flags: ["nodejs_compat"],
		observability: {
			enabled: true,
		},
	} satisfies RawConfig;

	const warnings = [
		...(analysis.usesExpressStatic
			? [
					"express.static() was detected. Static assets are not migrated automatically; configure Workers Static Assets separately if needed.",
				]
			: []),
		...(analysis.hasUpgradePattern
			? [
					"Node HTTP upgrade/WebSocket patterns may require Worker-native WebSocket handling.",
				]
			: []),
	];

	return createAdapterDetails(
		{
			projectPath,
			packageJson,
			packageManager,
			context,
		},
		{
			adapterId: "express-node-http-server",
			adapterName: "Express Node HTTP server",
			projectKind: "node-http-server",
			confidence:
				analysis.hasExpressImport || analysis.hasExpressFactory
					? "high"
					: "medium",
			sourceCategory: "worker-script",
			evidence: [
				...(hasExpressDependency
					? ["package.json has express dependency"]
					: []),
				...(analysis.hasExpressImport ? ["source imports express"] : []),
				...(analysis.hasExpressFactory ? ["source calls express()"] : []),
				...(analysis.hasListen ? ["source calls listen()"] : []),
				...(analysis.exportsApp ? ["source exports app"] : []),
			],
			plan: {
				mode: "persistent",
				wranglerConfig,
				filesToCreate: [{ path: wrapperPath, contents: wrapperContents }],
				packageJsonScripts: {
					deploy: "wrangler deploy",
					preview: "wrangler dev",
					...(language === "ts" ? { "cf-typegen": "wrangler types" } : {}),
				},
				warnings,
				summaryFields: {
					entrypoint: relativeOrDot(projectPath, absolutePath),
					generatedEntrypoint: wrapperPath,
					port,
				},
			},
		}
	);
}

async function detectRootContainer(
	input: ProjectAdapterDetectionInput
): Promise<AutoConfigDetailsForNonConfiguredProject | undefined> {
	if (!input.deployIntent?.containersAutoConfig) {
		return undefined;
	}

	for (const fileName of ["Dockerfile", "Containerfile"]) {
		const filePath = resolve(input.projectPath, fileName);
		const stats = statSync(filePath, { throwIfNoEntry: false });
		if (stats?.isFile()) {
			return await detectContainer(input, filePath, "medium");
		}
	}

	return undefined;
}

async function detectContainer(
	input: ProjectAdapterDetectionInput,
	dockerfilePath: string,
	confidence: DetectionConfidence
): Promise<AutoConfigDetailsForNonConfiguredProject | undefined> {
	if (!input.deployIntent?.containersAutoConfig) {
		return undefined;
	}

	const isExplicitDockerfileTarget =
		input.deployIntent.trigger === "explicit-target" &&
		input.deployIntent.sourceCategory === "dockerfile";
	const isAllowedSetup =
		input.deployIntent.trigger === "setup" &&
		input.deployIntent.allowNonInteractivePersistentSetup === true;

	if (
		(input.context.isNonInteractiveOrCI?.() ?? false) &&
		!isExplicitDockerfileTarget &&
		!isAllowedSetup
	) {
		throw new FatalError(
			"Dockerfile-to-Containers auto-configuration in non-interactive sessions requires an explicit Dockerfile target or `wrangler setup --yes`.",
			{ telemetryMessage: "autoconfig containers non interactive unsupported" }
		);
	}

	const projectPath = dirname(dockerfilePath);
	const packageJson = readPackageJson(projectPath) ?? input.packageJson;
	const packageManager = getPackageManager(projectPath);
	const workerName = getWorkerName(packageJson?.name, projectPath);
	const dockerfileContents = await readFile(dockerfilePath, "utf8");
	const { port, warnings: portWarnings } =
		inferContainerPort(dockerfileContents);
	const language = shouldGenerateTypescript(projectPath) ? "ts" : "js";
	const workerPath = `src/worker.${language}`;
	const className = "AppContainer";
	const bindingName = "APP_CONTAINER";
	const dockerfileConfigPath = `./${basename(dockerfilePath)}`;
	const wranglerConfig = {
		$schema: "node_modules/wrangler/config-schema.json",
		name: workerName,
		main: workerPath,
		compatibility_date: getTodaysCompatDate(),
		observability: {
			enabled: true,
		},
		containers: [
			{
				name: workerName,
				class_name: className,
				image: dockerfileConfigPath,
				max_instances: 1,
			},
		],
		durable_objects: {
			bindings: [
				{
					name: bindingName,
					class_name: className,
				},
			],
		},
		migrations: [
			{
				tag: "v1",
				new_sqlite_classes: [className],
			},
		],
	} as RawConfig;

	return createAdapterDetails(
		{
			...input,
			projectPath,
			packageJson,
			packageManager,
		},
		{
			adapterId: "dockerfile-container",
			adapterName: "Dockerfile Container",
			projectKind: "container-image",
			confidence,
			sourceCategory: "dockerfile",
			evidence: [`${basename(dockerfilePath)} detected`],
			plan: {
				mode: "persistent",
				wranglerConfig,
				dependencies: [{ name: "@cloudflare/containers" }],
				filesToCreate: [
					{
						path: workerPath,
						contents: createContainerWorker({
							bindingName,
							className,
							language,
							port,
						}),
					},
				],
				packageJsonScripts: {
					deploy: "wrangler deploy",
					preview: "wrangler dev",
					...(language === "ts" ? { "cf-typegen": "wrangler types" } : {}),
				},
				warnings: [
					"Docker must be installed and running for local Dockerfile builds.",
					"Containers require the Workers Paid plan.",
					"First deploys can take several minutes while the container application is provisioned.",
					...portWarnings,
				],
				summaryFields: {
					dockerfile: basename(dockerfilePath),
					generatedEntrypoint: workerPath,
					port,
					routing: "singleton",
					maxInstances: 1,
				},
			},
		}
	);
}

function createAdapterDetails(
	input: ProjectAdapterDetectionInput,
	options: {
		adapterId: string;
		adapterName: string;
		projectKind: AutoConfigDetailsForNonConfiguredProject["projectKind"];
		confidence: DetectionConfidence;
		sourceCategory: SourceCategory;
		evidence: string[];
		outputDir?: string;
		plan: ConfigurationPlan;
		deployTarget?: AutoConfigDetailsForNonConfiguredProject["deployTarget"];
	}
): AutoConfigDetailsForNonConfiguredProject {
	return {
		projectPath: input.projectPath,
		packageJson: input.packageJson,
		packageManager: input.packageManager,
		workerName: getWorkerName(input.packageJson?.name, input.projectPath),
		configured: false,
		projectKind: options.projectKind,
		adapterId: options.adapterId,
		adapterName: options.adapterName,
		confidence: options.confidence,
		sourceCategory: options.sourceCategory,
		evidence: options.evidence,
		outputDir: options.outputDir,
		configurationPlan: options.plan,
		deployTarget: options.deployTarget,
	};
}

async function hasIndexHtml(dir: string): Promise<boolean> {
	const children = await readdir(dir);
	return children.includes("index.html");
}

function isHtmlFile(filePath: string): boolean {
	return extname(filePath).toLowerCase() === ".html";
}

function isDockerfileName(filePath: string): boolean {
	const name = basename(filePath);
	return name === "Dockerfile" || name === "Containerfile";
}

function isJavaScriptOrTypeScriptFile(filePath: string): boolean {
	return [".js", ".mjs", ".cjs", ".ts"].includes(
		extname(filePath).toLowerCase()
	);
}

function hasDependency(
	packageJson: PackageJSON | undefined,
	name: string
): boolean {
	return Boolean(
		packageJson?.dependencies?.[name] ?? packageJson?.devDependencies?.[name]
	);
}

function shouldGenerateTypescript(
	projectPath: string,
	sourcePath?: string
): boolean {
	return (
		(sourcePath !== undefined && extname(sourcePath).toLowerCase() === ".ts") ||
		usesTypescript(projectPath)
	);
}

function analyzeNodeHttpServerSource(source: string): {
	hasExpressImport: boolean;
	hasExpressFactory: boolean;
	hasListen: boolean;
	exportsApp: boolean;
	port?: number;
	usesExpressStatic: boolean;
	hasUpgradePattern: boolean;
} {
	const constPorts = new Map<string, number>();
	for (const match of source.matchAll(
		/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(\d{2,5})/g
	)) {
		constPorts.set(match[1], Number(match[2]));
	}

	const listenMatch = source.match(/\.listen\s*\(\s*(\d{2,5})/);
	const listenConstMatch = source.match(
		/\.listen\s*\(\s*([A-Za-z_$][\w$]*)\s*[),]/
	);
	const envPortMatch = source.match(
		/process\.env\.PORT\s*(?:\|\||\?\?)\s*(\d{2,5})/
	);
	const listenConstPort = listenConstMatch
		? constPorts.get(listenConstMatch[1])
		: undefined;
	const port = listenMatch
		? Number(listenMatch[1])
		: listenConstPort
			? listenConstPort
			: envPortMatch
				? Number(envPortMatch[1])
				: undefined;

	return {
		hasExpressImport:
			/from\s+["']express["']/.test(source) ||
			/import\s+.*\s+from\s+["']express["']/.test(source) ||
			/require\(\s*["']express["']\s*\)/.test(source),
		hasExpressFactory: /express\s*\(\s*\)/.test(source),
		hasListen:
			/\.listen\s*\(/.test(source) ||
			/(?:http|https)\.createServer\s*\(/.test(source),
		exportsApp:
			/export\s+default\s+/.test(source) || /module\.exports\s*=/.test(source),
		port,
		usesExpressStatic: /express\.static\s*\(/.test(source),
		hasUpgradePattern:
			/\.on\s*\(\s*["']upgrade["']/.test(source) ||
			/\.addListener\s*\(\s*["']upgrade["']/.test(source),
	};
}

function getImportSpecifier(fromFile: string, toFile: string): string {
	let specifier = relative(dirname(fromFile), toFile).split(sep).join("/");
	if (!specifier.startsWith(".")) {
		specifier = `./${specifier}`;
	}
	return specifier;
}

function createNodeHttpServerWrapper({
	importSpecifier,
	port,
	hasListen,
	language,
}: {
	importSpecifier: string;
	port: number;
	hasListen: boolean;
	language: "js" | "ts";
}): string {
	const typeSuffix = language === "ts" ? ": number" : "";
	if (hasListen) {
		return `import { httpServerHandler } from "cloudflare:node";\n\nconst port${typeSuffix} = ${port};\nprocess.env.PORT ??= String(port);\nawait import(${JSON.stringify(importSpecifier)});\n\nexport default httpServerHandler({ port });\n`;
	}

	return `import { httpServerHandler } from "cloudflare:node";\nimport app from ${JSON.stringify(importSpecifier)};\n\nconst port${typeSuffix} = ${port};\nprocess.env.PORT ??= String(port);\napp.listen(port);\n\nexport default httpServerHandler({ port });\n`;
}

function inferContainerPort(dockerfileContents: string): {
	port: number;
	warnings: string[];
} {
	const exposedPorts = [
		...dockerfileContents.matchAll(/^\s*EXPOSE\s+(\d+)/gim),
	].map((match) => Number(match[1]));
	const envPort = dockerfileContents.match(/^\s*ENV\s+PORT=(\d+)/im);

	if (exposedPorts.length === 1) {
		return { port: exposedPorts[0], warnings: [] };
	}
	if (envPort) {
		return { port: Number(envPort[1]), warnings: [] };
	}
	if (exposedPorts.length > 1) {
		return {
			port: exposedPorts[0],
			warnings: [
				"Multiple EXPOSE ports were detected; the first port was selected. Update generated configuration if this is not your HTTP port.",
			],
		};
	}
	return {
		port: 80,
		warnings: [
			"No EXPOSE or ENV PORT was detected. Port 80 was selected; add EXPOSE to your Dockerfile if your app listens elsewhere.",
		],
	};
}

function createContainerWorker({
	bindingName,
	className,
	language,
	port,
}: {
	bindingName: string;
	className: string;
	language: "js" | "ts";
	port: number;
}): string {
	if (language === "ts") {
		return `import { Container, getContainer } from "@cloudflare/containers";\n\nexport class ${className} extends Container {\n\tdefaultPort = ${port};\n\tsleepAfter = "10m";\n\tenvVars = {\n\t\tPORT: "${port}",\n\t};\n}\n\ntype Env = {\n\t${bindingName}: DurableObjectNamespace<${className}>;\n};\n\nexport default {\n\tasync fetch(request: Request, env: Env): Promise<Response> {\n\t\tconst container = getContainer(env.${bindingName});\n\t\treturn container.fetch(request);\n\t},\n};\n`;
	}

	return `import { Container, getContainer } from "@cloudflare/containers";\n\nexport class ${className} extends Container {\n\tdefaultPort = ${port};\n\tsleepAfter = "10m";\n\tenvVars = {\n\t\tPORT: "${port}",\n\t};\n}\n\nexport default {\n\tasync fetch(request, env) {\n\t\tconst container = getContainer(env.${bindingName});\n\t\treturn container.fetch(request);\n\t},\n};\n`;
}

export async function ensureDirectoryForFile(filePath: string): Promise<void> {
	await mkdir(dirname(filePath), { recursive: true });
}

function relativeOrDot(from: string, to: string): string {
	const relativePath = relative(from, to).split(sep).join("/");
	return relativePath || ".";
}
