/* eslint-disable workers-sdk/no-vitest-import-expect -- helper functions with expect */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { getPackageManager, getPackageManagerName } from "../package-manager";
import { mockBinary } from "./helpers/mock-bin";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";

vi.unmock("../package-manager");
function mockUserAgent(userAgent = "npm") {
	beforeEach(() => {
		vi.stubEnv("npm_config_user_agent", userAgent);
	});
}
interface TestCase {
	npm: boolean;
	pnpm: boolean;
	yarn: boolean;
	bun: boolean;
	expectedPackageManager: string;
}

const testCases: TestCase[] = [
	// npm binary only
	{
		npm: true,
		yarn: false,
		pnpm: false,
		bun: false,

		expectedPackageManager: "npm",
	},

	// yarn binary only
	{
		npm: false,
		yarn: true,
		pnpm: false,
		bun: false,

		expectedPackageManager: "yarn",
	},

	// pnpm binary only
	{
		npm: false,
		yarn: false,
		pnpm: true,
		bun: false,

		expectedPackageManager: "pnpm",
	},

	// npm and yarn binaries
	{
		npm: true,
		yarn: true,
		pnpm: false,
		bun: false,

		expectedPackageManager: "npm",
	},

	// npm, yarn and pnpm binaries
	{
		npm: true,
		yarn: true,
		pnpm: true,
		bun: false,

		expectedPackageManager: "npm",
	},

	// npm, yarn, pnpm and bun binaries
	{
		npm: true,
		yarn: true,
		pnpm: true,
		bun: true,

		expectedPackageManager: "npm",
	},

	// bun binary only
	{
		npm: false,
		yarn: false,
		pnpm: false,
		bun: true,

		expectedPackageManager: "bun",
	},
];

describe("getPackageManager()", () => {
	mockUserAgent();
	runInTempDir();
	mockConsoleMethods();

	describe("no supported package manager", () => {
		mockYarn(false);
		mockNpm(false);
		mockPnpm(false);
		mockBun(false);

		it("should throw an error", async () => {
			await expect(() =>
				getPackageManager()
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Unable to find a package manager. Supported managers are: npm, yarn, pnpm, and bun.]`
			);
		});
	});

	for (const { npm, yarn, pnpm, bun, expectedPackageManager } of testCases) {
		describe(getTestCaseDescription(npm, yarn, pnpm, bun), () => {
			mockYarn(yarn);
			mockNpm(npm);
			mockPnpm(pnpm);
			mockBun(bun);

			it(`should return the ${expectedPackageManager} package manager`, async () => {
				const actualPackageManager = await getPackageManager();
				expect(getPackageManagerName(actualPackageManager)).toEqual(
					expectedPackageManager
				);
			});
		});
	}
});

/**
 * Create a fake yarn binary
 */
function mockYarn(succeed: boolean): void {
	let unMock: () => void;
	beforeEach(async () => {
		unMock = await mockBinary("yarn", `process.exit(${succeed ? 0 : 1})`);
	});
	afterEach(() => unMock());
}

/**
 * Create a fake npm binary
 */
function mockNpm(succeed: boolean): void {
	let unMock: () => void;
	beforeEach(async () => {
		unMock = await mockBinary("npm", `process.exit(${succeed ? 0 : 1})`);
	});
	afterEach(() => unMock());
}

/**
 * Create a fake pnpm binary
 */
function mockPnpm(succeed: boolean): void {
	let unMock: () => void;
	beforeEach(async () => {
		unMock = await mockBinary("pnpm", `process.exit(${succeed ? 0 : 1})`);
	});
	afterEach(() => unMock());
}

/**
 * Create a fake bun binary
 */
function mockBun(succeed: boolean): void {
	let unMock: () => void;
	beforeEach(async () => {
		unMock = await mockBinary("bun", `process.exit(${succeed ? 0 : 1})`);
	});
	afterEach(() => unMock());
}

function getTestCaseDescription(
	npm: boolean,
	yarn: boolean,
	pnpm: boolean,
	bun: boolean
): string {
	const criteria: string[] = [];
	if (npm) {
		criteria.push("npm");
	}

	if (yarn) {
		criteria.push("yarn");
	}

	if (pnpm) {
		criteria.push("pnpm");
	}

	if (bun) {
		criteria.push("bun");
	}

	return "using " + criteria.join("; ");
}
