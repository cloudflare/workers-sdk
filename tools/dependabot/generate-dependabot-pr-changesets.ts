import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
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
	// Comma-separated package names
	packageNames: string;
	// Path to package.json
	packageJSONPath: string;
	// Changeset file prefix
	changesetPrefix: string;
	// Optional label for grouped dependency updates
	changesetLabel?: string;
};

function processArgs(): Args {
	const args = [...argv];
	if (args[0] === process.execPath) {
		args.shift();
	}
	if (args[0] === __filename) {
		args.shift();
	}
	if (args.length !== 3 && args.length !== 4) {
		throw new Error(dedent`
			Incorrect arguments, please provide:
			- Packages: Coma-separated names of the workers-sdk packages whose dependencies are being updated
			- PackageJSON: The path to the package JSON being updated by Dependabot
			- Changeset prefix: The prefix to go on the front of generated changeset filenames.
			- Optional changeset label: Stable label for grouped dependency updates.
		`);
	}
	return {
		packageNames: args[0],
		packageJSONPath: args[1],
		changesetPrefix: args[2],
		changesetLabel: args[3],
	};
}

function main({
	packageNames,
	packageJSONPath,
	changesetPrefix,
	changesetLabel,
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
	const changesetFilename = getChangesetFilename(
		changesetPrefix,
		changes,
		changesetLabel
	);
	const mergedChanges = mergeChanges(
		readExistingChanges(changesetFilename),
		changes
	);
	const changesetHeader = generateChangesetHeader(packages);
	const commitMessage = generateCommitMessage(packages, mergedChanges);
	console.log(dedent`
		INFO: Writing changeset with the following commit message
		${commitMessage}`);
	writeChangeSet(changesetFilename, changesetHeader, commitMessage);
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

export function getChangesetFilename(
	changesetPrefix: string,
	changes: Map<string, Change>,
	changesetLabel?: string
): string {
	if (changesetLabel) {
		return `${changesetPrefix}-${getFilenameSlug(changesetLabel)}.md`;
	}
	const [dependencyName, ...additionalDependencies] = [...changes.keys()];
	if (dependencyName === undefined) {
		throw new Error(
			"Cannot generate changeset filename without dependency changes."
		);
	}
	if (additionalDependencies.length > 0) {
		throw new Error(
			"Cannot generate dependency-scoped changeset filename for multiple dependency changes. Pass a stable changeset label."
		);
	}

	return `${changesetPrefix}-${getFilenameSlug(dependencyName)}.md`;
}

export function getFilenameSlug(value: string): string {
	return value
		.replace(/^@/, "")
		.replace(/[^a-zA-Z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.toLowerCase();
}

export function readExistingChanges(
	changesetFilename: string
): Map<string, Change> {
	const changesetPath = `.changeset/${changesetFilename}`;
	try {
		return parseChangesetForChanges(readFileSync(changesetPath, "utf-8"));
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return new Map();
		}
		throw error;
	}
}

export function parseChangesetForChanges(
	changeset: string
): Map<string, Change> {
	const changes = new Map<string, Change>();
	for (const line of changeset.split("\n")) {
		const match = line.match(
			/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/
		);
		if (!match) {
			continue;
		}
		const [, rawName, rawFrom, rawTo] = match;
		if (rawName === undefined || rawFrom === undefined || rawTo === undefined) {
			continue;
		}
		const name = rawName.trim();
		const from = rawFrom.trim();
		const to = rawTo.trim();
		if (name === "Dependency" || /^-+$/.test(name)) {
			continue;
		}
		changes.set(name, { from, to });
	}
	return changes;
}

export function mergeChanges(
	existingChanges: Map<string, Change>,
	newChanges: Map<string, Change>
): Map<string, Change> {
	const mergedChanges = new Map(existingChanges);
	for (const [name, change] of newChanges.entries()) {
		const existingChange = existingChanges.get(name);
		mergedChanges.set(name, {
			from: existingChange?.from || change.from,
			to: change.to,
		});
	}
	return mergedChanges;
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
		Update dependencies of ${packages.map((p: string) => `"${p}"`).join(", ")}

		The following dependency versions have been updated:
		${table}
		`;
}

export function writeChangeSet(
	changesetFilename: string,
	changesetHeader: string,
	commitMessage: string
): void {
	writeFileSync(
		`.changeset/${changesetFilename}`,
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
