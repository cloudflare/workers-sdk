import { vi } from "vitest";
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
	expectedPackageManager: string;
}

const testCases: TestCase[] = [
	// npm binary only
	{
		npm: true,
		yarn: false,
		pnpm: false,

		expectedPackageManager: "npm",
	},

	// yarn binary only
	{
		npm: false,
		yarn: true,
		pnpm: false,

		expectedPackageManager: "yarn",
	},

	// pnpm binary only
	{
		npm: false,
		yarn: false,
		pnpm: true,

		expectedPackageManager: "pnpm",
	},

	// npm and yarn binaries
	{
		npm: true,
		yarn: true,
		pnpm: false,

		expectedPackageManager: "npm",
	},

	// npm, yarn and pnpm binaries
	{
		npm: true,
		yarn: true,
		pnpm: true,

		expectedPackageManager: "npm",
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

		it("should throw an error", async () => {
			await expect(() =>
				getPackageManager()
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Unable to find a package manager. Supported managers are: npm, yarn, and pnpm.]`
			);
		});
	});

	for (const { npm, yarn, pnpm, expectedPackageManager } of testCases) {
		describe(getTestCaseDescription(npm, yarn, pnpm), () => {
			mockYarn(yarn);
			mockNpm(npm);
			mockPnpm(pnpm);

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

function getTestCaseDescription(
	npm: boolean,
	yarn: boolean,
	pnpm: boolean
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

	return "using " + criteria.join("; ");
}
