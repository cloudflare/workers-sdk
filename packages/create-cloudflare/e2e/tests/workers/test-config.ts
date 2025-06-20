import { isExperimental, workerToTestFilter } from "../../helpers/constants";
import type { RunnerConfig } from "../../helpers/run-c3";

export type WorkerTestConfig = RunnerConfig & {
	name?: string;
	template: string;
	variants: string[];
};

function getExperimentalWorkerTests(): WorkerTestConfig[] {
	// none currently
	return [];
}

function getNonExperimentalWorkerTests(): WorkerTestConfig[] {
	return [
		{
			template: "hello-world",
			variants: ["ts", "js"],
			verifyDeploy: {
				route: "/",
				expectedText: "Hello World!",
			},
			verifyPreview: {
				previewArgs: ["--inspector-port=0"],
				route: "/",
				expectedText: "Hello World!",
			},
			verifyTest: true,
		},
		{
			template: "hello-world",
			variants: ["python"],
			verifyDeploy: {
				route: "/",
				expectedText: "Hello World!",
			},
			verifyPreview: {
				previewArgs: ["--inspector-port=0"],
				route: "/",
				expectedText: "Hello World!",
			},
		},
		{
			template: "hello-world-with-assets",
			variants: ["ts", "js"],
			verifyDeploy: {
				route: "/message",
				expectedText: "Hello, World!",
			},
			// There is no preview script
			verifyPreview: null,
			verifyTest: true,
			argv: ["--category", "hello-world"],
		},
		{
			template: "hello-world-with-assets",
			variants: ["python"],
			verifyDeploy: {
				route: "/message",
				expectedText: "Hello, World!",
			},
			// There is no preview script
			verifyPreview: null,
			argv: ["--category", "hello-world"],
		},
		{
			template: "hello-world-durable-object",
			variants: ["ts", "js"],
			verifyDeploy: {
				route: "/",
				expectedText: "Hello, world!",
			},
			// There is no preview script
			verifyPreview: null,
			argv: ["--category", "hello-world"],
		},
		{
			template: "hello-world-durable-object",
			variants: ["python"],
			verifyDeploy: {
				route: "/",
				expectedText: "Hello, world!",
			},
			// There is no preview script
			verifyPreview: null,
			argv: ["--category", "hello-world"],
		},
		{
			template: "hello-world-durable-object-with-assets",
			variants: ["ts", "js"],
			verifyDeploy: {
				route: "/",
				expectedText: "Hello, World!",
			},
			// There is no preview script
			verifyPreview: null,
			argv: ["--category", "hello-world"],
		},
		{
			template: "hello-world-durable-object-with-assets",
			variants: ["python"],
			verifyDeploy: {
				route: "/message",
				expectedText: "Hello, world!",
			},
			// There is no preview script
			verifyPreview: null,
			argv: ["--category", "hello-world"],
		},
		{
			template: "hello-world-assets-only",
			variants: [],
			verifyDeploy: {
				route: "/",
				expectedText: "Hello, World!",
			},
			// There is no preview script
			verifyPreview: null,
			argv: ["--category", "hello-world"],
		},
		{
			template: "hello-world-workflows",
			argv: ["--category", "hello-world"],
			variants: ["ts", "js"],
			verifyDeploy: {
				route: "/",
				expectedText: "details",
			},
			verifyPreview: {
				previewArgs: ["--inspector-port=0"],
				route: "/",
				expectedText: "details",
			},
		},
		{
			template: "common",
			variants: ["ts", "js"],
			verifyDeploy: {
				route: "/",
				expectedText: "Try making requests to:",
			},
			verifyPreview: {
				previewArgs: ["--inspector-port=0"],
				route: "/",
				expectedText: "Try making requests to:",
			},
		},
		{
			template: "queues",
			variants: ["ts", "js"],
			// Skipped for now, since C3 does not yet support resource creation
			verifyDeploy: null,
			verifyPreview: null,
		},
		{
			template: "scheduled",
			variants: ["ts", "js"],
			// Skipped for now, since it's not possible to test scheduled events on deployed Workers
			verifyDeploy: null,
			verifyPreview: null,
		},
		{
			template: "openapi",
			variants: [],
			verifyDeploy: {
				route: "/",
				expectedText: "SwaggerUI",
			},
			verifyPreview: {
				previewArgs: ["--inspector-port=0"],
				route: "/",
				expectedText: "SwaggerUI",
			},
		},
	];
}

/**
 * Get a list of Worker test configurations based on the provided `options`.
 *
 * @param options - An object containing the following properties:
 *   - isExperimentalMode: A boolean indicating if experimental mode is enabled.
 *   - workerTestFilter: A string that can be used to filter the tests by "name" or "name:variant".
 */
export function getWorkerTests(): WorkerTestConfig[] {
	const workerTests = isExperimental
		? getExperimentalWorkerTests()
		: getNonExperimentalWorkerTests();
	return workerTests
		.flatMap((testConfig) =>
			testConfig.variants.length > 0
				? testConfig.variants.map((variant) => {
						return {
							...testConfig,
							name: `${testConfig.name ?? testConfig.template}:${variant.toLowerCase()}`,
							argv: (testConfig.argv ?? []).concat("--lang", variant),
						} satisfies WorkerTestConfig;
					})
				: [{ ...testConfig, name: testConfig.name ?? testConfig.template }],
		)
		.filter((testConfig) => {
			if (!workerToTestFilter) {
				return true;
			}
			if (workerToTestFilter.includes(":")) {
				return testConfig.name === workerToTestFilter;
			}
			return testConfig.name.split(":")[0] === workerToTestFilter;
		});
}
