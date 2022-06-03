import { existsSync } from "node:fs";
import { join } from "node:path";
import { execa, execaCommandSync } from "execa";
import { logger } from "./logger";

export interface PackageManager {
  cwd: string;
  type: "npm" | "yarn" | "pnpm";
  addDevDeps(...packages: string[]): Promise<void>;
  install(): Promise<void>;
}

export async function getPackageManager(cwd: string): Promise<PackageManager> {
  const [hasYarn, hasNpm, hasPnpm] = await Promise.all([
    supportsYarn(),
    supportsNpm(),
    supportsPnpm(),
  ]);
  const hasYarnLock = existsSync(join(cwd, "yarn.lock"));
  const hasNpmLock = existsSync(join(cwd, "package-lock.json"));
  const hasPnpmLock = existsSync(join(cwd, "pnpm-lock.yaml"));

  if (hasNpmLock) {
    if (hasNpm) {
      logger.log(
        "Using npm as package manager, as there is already a package-lock.json file."
      );
      return { ...NpmPackageManager, cwd };
    } else if (hasYarn) {
      logger.log("Using yarn as package manager.");
      logger.warn(
        "There is already a package-lock.json file but could not find npm on the PATH."
      );
      return { ...YarnPackageManager, cwd };
    }
  } else if (hasPnpmLock) {
    if (hasPnpm) {
      logger.log(
        "Using pnpm as package manager, as there is already a pnpm-lock.yaml file."
      );
      return { ...PnpmPackageManager, cwd };
    } else {
      logger.warn(
        "There is already a pnpm-lock.yaml file but could not find pnpm on the PATH."
      );
      // will simply fallback to the first found of [npm, yaml, pnpm] in the next if round.
    }
  } else if (hasYarnLock) {
    if (hasYarn) {
      logger.log(
        "Using yarn as package manager, as there is already a yarn.lock file."
      );
      return { ...YarnPackageManager, cwd };
    } else if (hasNpm) {
      logger.log("Using npm as package manager.");
      logger.warn(
        "There is already a yarn.lock file but could not find yarn on the PATH."
      );
      return { ...NpmPackageManager, cwd };
    }
  }

  if (hasNpm) {
    logger.log("Using npm as package manager.");
    return { ...NpmPackageManager, cwd };
  } else if (hasYarn) {
    logger.log("Using yarn as package manager.");
    return { ...YarnPackageManager, cwd };
  } else if (hasPnpm) {
    logger.log("Using pnpm as package manager.");
    return { ...PnpmPackageManager, cwd };
  } else {
    throw new Error(
      "Unable to find a package manager. Supported managers are: npm, yarn, and pnpm."
    );
  }
}

/**
 * Get the name of the given `packageManager`.
 */
export function getPackageManagerName(packageManager: PackageManager): string {
  return packageManager.type ?? "unknown";
}

/**
 * Manage packages using npm
 */
const NpmPackageManager: PackageManager = {
  cwd: process.cwd(),
  type: "npm",
  /** Add and install a new devDependency into the local package.json. */
  async addDevDeps(...packages: string[]): Promise<void> {
    await execa("npm", ["install", ...packages, "--save-dev"], {
      stdio: "inherit",
      cwd: this.cwd,
    });
  },

  /** Install all the dependencies in the local package.json. */
  async install(): Promise<void> {
    await execa("npm", ["install"], {
      stdio: "inherit",
      cwd: this.cwd,
    });
  },
};

/**
 * Manage packages using pnpm
 */
const PnpmPackageManager: PackageManager = {
  cwd: process.cwd(),
  type: "pnpm",
  /** Add and install a new devDependency into the local package.json. */
  async addDevDeps(...packages: string[]): Promise<void> {
    await execa("pnpm", ["install", ...packages, "--save-dev"], {
      stdio: "inherit",
      cwd: this.cwd,
    });
  },

  /** Install all the dependencies in the local package.json. */
  async install(): Promise<void> {
    await execa("pnpm", ["install"], {
      stdio: "inherit",
      cwd: this.cwd,
    });
  },
};

/**
 * Manage packages using yarn
 */
const YarnPackageManager: PackageManager = {
  cwd: process.cwd(),
  type: "yarn",
  /** Add and install a new devDependency into the local package.json. */
  async addDevDeps(...packages: string[]): Promise<void> {
    await execa("yarn", ["add", ...packages, "--dev"], {
      stdio: "inherit",
      cwd: this.cwd,
    });
  },

  /** Install all the dependencies in the local package.json. */
  async install(): Promise<void> {
    await execa("yarn", ["install"], {
      stdio: "inherit",
      cwd: this.cwd,
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

function supportsPnpm(): Promise<boolean> {
  return supports("pnpm");
}
