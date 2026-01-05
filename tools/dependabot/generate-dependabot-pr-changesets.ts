import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { argv } from "node:process";
import dedent from "ts-dedent";

if (require.main === module) {
	try {
		console.log(dedent`
			Generate Dependabot Changeset
			=============================
			`);

		main(processArgs());
	} catch (e) {
		if (e instanceof Error) {
			console.error(e.message);
		} else {
			console.error(`Error: ${e}`);
		}
		process.exit(1);
	}
}

type Args = {
	// PR number
	prNumber: string;
	// Comma-separated package names
	packageNames: string;
	// Path to package.json
	packageJSONPath: string;
	// Changeset file prefix
	changesetPrefix: string;
};

function processArgs(): Args {
	const args = [...argv];
	if (args[0] === process.execPath) {
		args.shift();
	}
	if (args[0] === __filename) {
		args.shift();
	}
	if (args.length !== 4) {
		throw new Error(dedent`
			Incorrect arguments, please provide:
			- PR: The number of the current Dependabot PR
			- Packages: Coma-separated names of the workers-sdk packages whose dependencies are being updated
			- PackageJSON: The path to the package JSON being updated by Dependabot
			- Changeset prefix: The prefix to go on the front of the filename of the generated changeset.
		`);
	}
	return {
		prNumber: args[0],
		packageNames: args[1],
		packageJSONPath: args[2],
		changesetPrefix: args[3],
	};
}

function main({
	prNumber,
	packageNames,
	packageJSONPath,
	changesetPrefix,
}: Args): void {
	const diffLines = getPackageJsonDiff(resolve(packageJSONPath));
	const changes = parseDiffForChanges(diffLines);
	if (changes.size === 0) {
		console.warn(dedent`
			WARN: No dependency changes detected for "${packageNames}".
			`);
		return;
	}
	const packages = packageNames.split(",").map((name: string) => name.trim());
	const changesetHeader = generateChangesetHeader(packages);
	const commitMessage = generateCommitMessage(packages, changes);
	console.log(dedent`
		INFO: Writing changeset with the following commit message
		${commitMessage}`);
	writeChangeSet(changesetPrefix, prNumber, changesetHeader, commitMessage);
	commitAndPush(commitMessage);
}

export function getPackageJsonDiff(packageJSONPath: string): string[] {
	return executeCommand("git", ["diff", "HEAD~1", packageJSONPath]);
}

export type Change = {
	from: string;
	to: string;
};

export function parseDiffForChanges(
	diffLines: (string | undefined)[]
): Map<string, Change> {
	const diffLineRegex = new RegExp(`^[+-]\\s*"(.*)":\\s"(.*)",?`);
	const changes = new Map<string, Change>();
	for (const line of diffLines) {
		const match = line?.match(diffLineRegex);
		if (match) {
			const [matchedLine, name, version] = match;
			const fromToProp = matchedLine.startsWith("+") ? "to" : "from";
			const change = changes.get(name) ?? { from: "", to: "" };
			change[fromToProp] = version;
			changes.set(name, change);
		}
	}
	return changes;
}

export function generateChangesetHeader(packages: string[]): string {
	const lines = ["---"];
	for (const packageName of packages) {
		lines.push(`"${packageName}": patch`);
	}
	lines.push("---");
	return lines.join("\n");
}

export function generateCommitMessage(
	packages: string[],
	changes: Map<string, Change>
): string {
	const widths = [10, 4, 2];
	for (const [name, { from, to }] of changes.entries()) {
		if (from && to) {
			widths[0] = Math.max(widths[0], name.length);
			widths[1] = Math.max(widths[1], from.length);
			widths[2] = Math.max(widths[2], to.length);
		}
	}

	function padded(text: string, column: number): string {
		return text + " ".repeat(widths[column] - text.length);
	}

	let table =
		`\n| ${padded("Dependency", 0)} | ${padded("From", 1)} | ${padded(
			"To",
			2
		)} |` +
		`\n| ${"-".repeat(widths[0])} | ${"-".repeat(widths[1])} | ${"-".repeat(
			widths[2]
		)} |`;
	for (const [name, { from, to }] of changes.entries()) {
		if (!from || !to) {
			console.warn(dedent`
				WARN: Unexpected changes for package "${name}", from: "${from}", to: "${to}".
				Could not determine upgrade versions.`);
		} else {
			table += `\n| ${padded(name, 0)} | ${padded(from, 1)} | ${padded(
				to,
				2
			)} |`;
		}
	}
	return dedent`
		chore: update dependencies of ${packages.map((p: string) => `"${p}"`).join(", ")}

		The following dependency versions have been updated:
		${table}
		`;
}

export function writeChangeSet(
	changesetPrefix: string,
	prNumber: string,
	changesetHeader: string,
	commitMessage: string
): void {
	writeFileSync(
		`.changeset/${changesetPrefix}-${prNumber}.md`,
		changesetHeader + "\n\n" + commitMessage + "\n"
	);
}

export function commitAndPush(commitMessage: string): void {
	executeCommand("git", ["add", ".changeset"]);
	executeCommand("git", ["commit", "-m", commitMessage]);
	executeCommand("git", ["push"]);
}

function executeCommand(command: string, args: string[]): string[] {
	const { output, error, status, stderr } = spawnSync(command, args, {
		encoding: "utf-8",
	});
	if (status || error) {
		throw error ?? new Error(stderr);
	}
	return output
		.flatMap((chunk) => chunk?.split("\n"))
		.filter((line) => line !== undefined);
}
