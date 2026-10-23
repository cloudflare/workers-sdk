import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FatalError } from "@cloudflare/workers-utils";
import * as find from "empathic/find";
import { isMap, isScalar, parseDocument, Scalar } from "yaml";

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
 *
 * @param projectPath - The project being configured.
 * @param options - Set dryRun to preview approvals without writing the workspace file.
 * @returns The workspace path and packages whose approvals would change, if any.
 */
export async function writePnpmBuildApprovals(
	projectPath: string,
	{ dryRun = false }: { dryRun?: boolean } = {}
): Promise<{ workspacePath: string; packages: string[] } | undefined> {
	const workspacePath =
		find.file("pnpm-workspace.yaml", { cwd: projectPath }) ??
		join(projectPath, "pnpm-workspace.yaml");

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
	if (!approvals) {
		const key = new Scalar("allowBuilds");
		key.spaceBefore = original.trim().length > 0;
		document.set(key, document.createNode({}));
	}
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
