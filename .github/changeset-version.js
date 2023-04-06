const { execSync } = require("node:child_process");

// This script is used by the `release.yml` workflow to update the version of the packages being released.
// The standard step is only to run `changeset version` but this does not update the package-lock.json file.
// So we also run `npm install`, which does this update.
// This is a workaround until this is handled automatically by `changeset version`.
// See https://github.com/changesets/changesets/issues/421.
execSync("npx changeset version");

// HACK: run a newer version of npm that can update package-lock.json using local dependencies.
// See https://github.com/npm/cli/issues/4379 and https://github.com/npm/cli/pull/4371.
// The error looks like: `No matching version found for wrangler@^2.15.0.`
if (!process.version.startsWith("v16")) {
	throw new Error(
		"You have updated node version and so you must now remove the hack below!"
	);
}
execSync("npx -y npm@8.5.0 install --package-lock-only");
