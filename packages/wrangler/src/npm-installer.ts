import { execa } from "execa";

/**
 * Helpers for running npm commands
 */
export const npm = {
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
