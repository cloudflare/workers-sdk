import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { DefaultArtifactClient } from "@actions/artifact";
import {
	getPackagesForPrerelease,
	getPrereleaseArtifactUrl,
	getPrereleasePRArtifactUrl,
	projectRoot,
} from "./0-packages.mjs";

const artifact = new DefaultArtifactClient();

/**
 * @param {~Package} pkg
 * @returns {string}
 */
function buildWranglerArtifactReport(pkg) {
	const name = pkg.json.name;
	assert.strictEqual(name, "wrangler");
	const url = getPrereleaseArtifactUrl(name);
	const prUrl = getPrereleasePRArtifactUrl(name);
	return `A wrangler prerelease is available for testing. You can install this latest build in your project with:

\`\`\`sh
npm install --save-dev ${url}
\`\`\`

You can reference the automatically updated head of this PR with:

\`\`\`sh
npm install --save-dev ${prUrl}
\`\`\`

Or you can use \`npx\` with this latest build directly:

\`\`\`sh
npx ${url} dev path/to/script.js
\`\`\``;
}

/**
 * @param {~Package} pkg
 * @returns {string}
 */
function buildAdditionalArtifactReport(pkg) {
	const name = pkg.json.name;
	const type = pkg.json["workers-sdk"].type;
	const url = getPrereleaseArtifactUrl(name);
	if (type === "cli") {
		return `\`\`\`sh\nnpx ${url} --no-auto-update\n\`\`\``;
	} else if (type === "extension") {
		return `\`\`\`sh\nwget ${url} -O ./${name}.${pkg.json.version}.vsix && code --install-extension ./${name}.${pkg.json.version}.vsix\n\`\`\``;
	} else {
		return `\`\`\`sh\nnpm install ${url}\n\`\`\``;
	}
}

/**
 * @param {~Package[]} pkgs
 * @returns {string}
 */
function buildReport(pkgs) {
	const wranglerPkgIndex = pkgs.findIndex(
		(pkg) => pkg.json.name === "wrangler"
	);
	assert(wranglerPkgIndex !== -1, "Expected wrangler to be pre-released");
	const [wranglerPkg] = pkgs.splice(wranglerPkgIndex, 1);

	const wranglerReport = buildWranglerArtifactReport(wranglerPkg);
	const additionalReports = pkgs.map(buildAdditionalArtifactReport);

	return `${wranglerReport}

<details><summary>Additional artifacts:</summary>

${additionalReports.join("\n\n")}

Note that these links will no longer work once [the GitHub Actions artifact expires](https://docs.github.com/en/organizations/managing-organization-settings/configuring-the-retention-period-for-github-actions-artifacts-and-logs-in-your-organization).

</details>
`;
}

{
	const pkgs = getPackagesForPrerelease();
	const report = buildReport(pkgs);
	const reportName = "prerelease-report.md";
	const reportPath = path.join(projectRoot, reportName);
	fs.writeFileSync(reportPath, report);
	console.log(`Uploading ${reportPath} as ${reportName}...`);
	await artifact.uploadArtifact(reportName, [reportPath], projectRoot);
}
