import semver from "semver";
import whichPmRuns from "which-pm-runs";
import { devDependencies } from "../../package.json";

/*
  A helper function for determining which pm command to use based on which one the user
  invoked this CLI with.

  The entries of the return type are used for the following operations:
  - npm: running commands with the package manager (ex. `npm install` or `npm run build`)
  - npx: executing code local to the working directory (ex. `npx wrangler whoami`)
  - dlx: executing packages that are not installed locally (ex. `pnpm dlx create-solid`)
*/
export const detectPackageManager = () => {
	let { name, version } = whichPmRuns() ?? { name: "npm", version: "0.0.0" };

	if (process.env.TEST_PM) {
		switch (process.env.TEST_PM) {
			case "pnpm":
				name = "pnpm";
				version = devDependencies["pnpm"].replace("^", "");
				process.env.npm_config_user_agent = "pnpm";
				break;
			case "yarn":
				name = "yarn";
				version = devDependencies["yarn"].replace("^", "");
				process.env.npm_config_user_agent = "yarn";
				break;
			case "bun":
				name = "bun";
				version = "1.0.0";
				process.env.npm_config_user_agent = "bun";
				break;
			case "npm":
				name = "npm";
				version = "0.0.0";
				process.env.npm_config_user_agent = "npm";
				break;
		}
	}

	switch (name) {
		case "pnpm":
			if (semver.gt(version, "6.0.0")) {
				return {
					name,
					version,
					npm: "pnpm",
					npx: "pnpm",
					dlx: ["pnpm", "dlx"],
				};
			}
			return {
				name,
				version,
				npm: "pnpm",
				npx: "pnpx",
				dlx: ["pnpx"],
			};
		case "yarn":
			if (semver.gt(version, "2.0.0")) {
				return {
					name,
					version,
					npm: "yarn",
					npx: "yarn",
					dlx: ["yarn", "dlx"],
				};
			}
			return {
				name,
				version,
				npm: "yarn",
				npx: "yarn",
				dlx: ["yarn"],
			};
		case "bun":
			return {
				name,
				version,
				npm: "bun",
				npx: "bunx",
				dlx: ["bunx"],
			};

		case "npm":
		default:
			return {
				name,
				version,
				npm: "npm",
				npx: "npx",
				dlx: ["npx"],
			};
	}
};
