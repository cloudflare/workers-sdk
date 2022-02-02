import { existsSync } from "node:fs";
import { join } from "node:path";
import { execa, execaCommandSync } from "execa";

export interface PackageManager {
  addDevDeps(...packages: string[]): Promise<void>;
  install(): Promise<void>;
}

export async function getPackageManager(root: string): Promise<PackageManager> {
  const [hasYarn, hasNpm] = await Promise.all([supportsYarn(), supportsNpm()]);
  const hasYarnLock = existsSync(join(root, "yarn.lock"));
  const hasNpmLock = existsSync(join(root, "package-lock.json"));

  if (hasNpmLock) {
    if (hasNpm) {
      console.log(
        "Using npm as package manager, as there is already a package-lock.json file."
      );
      return NpmPackageManager;
    } else if (hasYarn) {
      console.log("Using yarn as package manager.");
      console.warn(
        "There is already a package-lock.json file but could not find npm on the PATH."
      );
      return YarnPackageManager;
    }
  } else if (hasYarnLock) {
    if (hasYarn) {
      console.log(
        "Using yarn as package manager, as there is already a yarn.lock file."
      );
      return YarnPackageManager;
    } else if (hasNpm) {
      console.log("Using npm as package manager.");
      console.warn(
        "There is already a yarn.lock file but could not find yarn on the PATH."
      );
      return NpmPackageManager;
    }
  }

  if (hasNpm) {
    console.log("Using npm as package manager.");
    return NpmPackageManager;
  } else if (hasYarn) {
    console.log("Using yarn as package manager.");
    return YarnPackageManager;
  } else {
    throw new Error(
      "Unable to find a package manager. Supported managers are: npm and yarn."
    );
  }
}

/**
 * Get the name of the given `packageManager`.
 */
export function getPackageManagerName(packageManager: unknown): string {
  return packageManager === NpmPackageManager
    ? "npm"
    : packageManager === YarnPackageManager
    ? "yarn"
    : "unknown";
}

/**
 * Manage packages using npm
 */
const NpmPackageManager: PackageManager = {
  /** Add and install a new devDependency into the local package.json. */
  async addDevDeps(...packages: string[]): Promise<void> {
    await execa("npm", ["install", ...packages, "--save-dev"], {
      stdio: "inherit",
    });
  },

  /** Install all the dependencies in the local package.json. */
  async install(): Promise<void> {
    await execa("npm", ["install"], {
      stdio: "inherit",
    });
  },
};

/**
 * Manage packages using yarn
 */
const YarnPackageManager: PackageManager = {
  /** Add and install a new devDependency into the local package.json. */
  async addDevDeps(...packages: string[]): Promise<void> {
    await execa("yarn", ["add", ...packages, "--dev"], {
      stdio: "inherit",
    });
  },

  /** Install all the dependencies in the local package.json. */
  async install(): Promise<void> {
    await execa("yarn", ["install"], {
      stdio: "inherit",
    });
  },
};

async function supports(name: string): Promise<boolean> {
  try {
    execaCommandSync(`${name} --version`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function supportsYarn(): Promise<boolean> {
  return supports("yarn");
}

function supportsNpm(): Promise<boolean> {
  return supports("npm");
}
