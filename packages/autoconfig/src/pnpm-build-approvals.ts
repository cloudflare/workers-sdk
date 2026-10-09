import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { FatalError } from "@cloudflare/workers-utils";
import { isMap, isScalar, parseDocument } from "yaml";

const REQUIRED_BUILDS = ["esbuild", "workerd"];
const LEGACY_BUILD_SETTINGS = [
	"onlyBuiltDependencies",
	"onlyBuiltDependenciesFile",
	"neverBuiltDependencies",
	"ignoredBuiltDependencies",
	"ignoreDepScripts",
];

/**
 * Approve the native dependencies installed by autoconfig at the pnpm workspace root.
 * Existing build decisions, including version-scoped policies, remain authoritative.
 * @param projectPath - The project being configured.
 * @param options - Set dryRun to preview approvals without writing the workspace file.
 * @returns The workspace path and packages whose approvals would change, if any.
 */
export async function writePnpmBuildApprovals(
	projectPath: string,
	{ dryRun = false }: { dryRun?: boolean } = {}
): Promise<{ workspacePath: string; packages: string[] } | undefined> {
	let directory = resolve(projectPath);
	let workspacePath = join(directory, "pnpm-workspace.yaml");
	while (!existsSync(workspacePath)) {
		const parent = dirname(directory);
		if (parent === directory) {
			workspacePath = join(projectPath, "pnpm-workspace.yaml");
			break;
		}
		directory = parent;
		workspacePath = join(directory, "pnpm-workspace.yaml");
	}

	const original = existsSync(workspacePath)
		? await readFile(workspacePath, "utf8")
		: "";
	const document = parseDocument(original);
	if (
		document.errors.length ||
		(document.contents && !isMap(document.contents))
	) {
		throw new FatalError(
			`Cannot update build approvals in ${workspacePath}: expected a valid YAML mapping.`,
			{
				telemetryMessage: "autoconfig pnpm build policy invalid",
			}
		);
	}
	if (
		document.get("dangerouslyAllowAllBuilds") === true ||
		LEGACY_BUILD_SETTINGS.some((key) => document.has(key))
	) {
		return;
	}
	const node = document.get("allowBuilds", true);
	if (node !== undefined && !isMap(node)) {
		throw new FatalError(
			`Cannot update build approvals in ${workspacePath}: allowBuilds must be a mapping.`,
			{
				telemetryMessage: "autoconfig pnpm build policy invalid",
			}
		);
	}
	const approvals = isMap(node) ? node : undefined;
	const keys =
		approvals?.items.map((item) =>
			isScalar(item.key) ? item.key.value : undefined
		) ?? [];
	const packages: string[] = [];
	for (const name of REQUIRED_BUILDS) {
		// Do not broaden an existing glob or version-specific decision into an unconditional approval.
		if (
			(approvals?.has(name) &&
				approvals.get(name) !== "set this to true or false") ||
			keys.some(
				(key) =>
					typeof key !== "string" ||
					/[*!?{}[\]\\]/.test(key) ||
					key.startsWith(`${name}@`)
			)
		) {
			continue;
		}
		document.setIn(["allowBuilds", name], true);
		packages.push(name);
	}
	if (packages.length > 0) {
		if (!dryRun) {
			const updated = document.toString();
			await writeFile(
				workspacePath,
				original.includes("\r\n") ? updated.replace(/\n/g, "\r\n") : updated
			);
		}
		return { workspacePath, packages };
	}
}
