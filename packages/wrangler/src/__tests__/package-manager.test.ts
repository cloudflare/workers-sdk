import { writeFileSync } from "node:fs";
import { mockBinary } from "./helpers/mock-bin";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";

const { getPackageManager, getPackageManagerName } =
  jest.requireActual("../package-manager");
interface TestCase {
  npm: boolean;
  yarn: boolean;
  npmLockFile: boolean;
  yarnLockFile: boolean;
  expectedPackageManager: string;
}

const testCases: TestCase[] = [
  // npm binary - no yarn binary
  {
    npm: true,
    yarn: false,
    npmLockFile: false,
    yarnLockFile: false,
    expectedPackageManager: "npm",
  },
  {
    npm: true,
    yarn: false,
    npmLockFile: true,
    yarnLockFile: false,
    expectedPackageManager: "npm",
  },
  {
    npm: true,
    yarn: false,
    npmLockFile: false,
    yarnLockFile: true,
    expectedPackageManager: "npm",
  },
  {
    npm: true,
    yarn: false,
    npmLockFile: true,
    yarnLockFile: true,
    expectedPackageManager: "npm",
  },

  // yarn binary - no npm binary
  {
    npm: false,
    yarn: true,
    npmLockFile: false,
    yarnLockFile: false,
    expectedPackageManager: "yarn",
  },
  {
    npm: false,
    yarn: true,
    npmLockFile: true,
    yarnLockFile: false,
    expectedPackageManager: "yarn",
  },
  {
    npm: false,
    yarn: true,
    npmLockFile: false,
    yarnLockFile: true,
    expectedPackageManager: "yarn",
  },
  {
    npm: false,
    yarn: true,
    npmLockFile: true,
    yarnLockFile: true,
    expectedPackageManager: "yarn",
  },

  // npm and yarn binaries
  {
    npm: true,
    yarn: true,
    npmLockFile: false,
    yarnLockFile: false,
    expectedPackageManager: "npm",
  },
  {
    npm: true,
    yarn: true,
    npmLockFile: true,
    yarnLockFile: false,
    expectedPackageManager: "npm",
  },
  {
    npm: true,
    yarn: true,
    npmLockFile: false,
    yarnLockFile: true,
    expectedPackageManager: "yarn",
  },
  {
    npm: true,
    yarn: true,
    npmLockFile: true,
    yarnLockFile: true,
    expectedPackageManager: "npm",
  },
];

describe("getPackageManager()", () => {
  runInTempDir();
  mockConsoleMethods();

  describe("no supported package manager", () => {
    mockYarn(false);
    mockNpm(false);

    it("should throw an error", async () => {
      await expect(() =>
        getPackageManager(process.cwd())
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Unable to find a package manager. Supported managers are: npm and yarn."`
      );
    });
  });

  for (const {
    npm,
    yarn,
    npmLockFile,
    yarnLockFile,
    expectedPackageManager,
  } of testCases) {
    describe(
      getTestCaseDescription(npm, yarn, npmLockFile, yarnLockFile),
      () => {
        mockYarn(yarn);
        mockNpm(npm);
        mockLockFiles(npmLockFile, yarnLockFile);

        it(`should return the ${expectedPackageManager} package manager`, async () => {
          const actualPackageManager = await getPackageManager(process.cwd());
          expect(getPackageManagerName(actualPackageManager)).toEqual(
            expectedPackageManager
          );
        });
      }
    );
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
 * Create a fake lock files.
 */
function mockLockFiles(npmLockFile: boolean, yarnLockFile: boolean) {
  beforeEach(() => {
    if (npmLockFile) {
      writeFileSync("package-lock.json", "");
    }
    if (yarnLockFile) {
      writeFileSync("yarn.lock", "");
    }
  });
}

function getTestCaseDescription(
  npm: boolean,
  yarn: boolean,
  npmLockFile: boolean,
  yarnLockFile: boolean
): string {
  const criteria: string[] = [];
  if (npm) {
    criteria.push("npm");
  }
  if (npmLockFile) {
    criteria.push("package-lock.json");
  }
  if (yarn) {
    criteria.push("yarn");
  }
  if (yarnLockFile) {
    criteria.push("yarn.lock");
  }
  return "using " + criteria.join("; ");
}
