import semver from "semver";
import whichPmRuns from "which-pm-runs";

/*
  A helper function for determining which pm command to use based on which one the user
  invoked this CLI with.

  The entries of the return type are used for the following operations:
  - npm: running commands with the package manager (ex. `npm install` or `npm run build`)
  - npx: executing code local to the working directory (ex. `npx wrangler whoami`)
  - dlx: executing packages that are not installed locally (ex. `pnpm dlx create-solid`)
*/
export const detectPackageManager = () => {
	const { name, version } = whichPmRuns() ?? { name: "npm", version: "0.0.0" };

	switch (name) {
		case "pnpm":
			if (semver.gt(version, "6.0.0")) {
				return {
					npm: "pnpm",
					npx: "pnpm",
					dlx: "pnpm dlx",
				};
			}
			return {
				npm: "pnpm",
				npx: "pnpx",
				dlx: "pnpx",
			};
		case "yarn":
			if (semver.gt(version, "2.0.0")) {
				return {
					npm: "yarn",
					npx: "yarn",
					dlx: "yarn dlx",
				};
			}
			return {
				npm: "yarn",
				npx: "yarn",
				dlx: "yarn",
			};
		case "npm":
		default:
			return {
				npm: "npm",
				npx: "npx",
				dlx: "npx",
			};
	}
};
