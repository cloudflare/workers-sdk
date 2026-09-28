import { ENVIRONMENTS_DOCS_URL } from "./follow-ups";
import type {
	ConvertedBranch,
	ConvertedWranglerConfig,
	MigrationFollowUp,
	OutputComment,
	OutputObject,
	OutputValue,
} from "./types";

const IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/;

function indent(depth: number): string {
	return "\t".repeat(depth);
}

function sanitizeComment(value: string): string {
	return value.replaceAll("*/", "* /");
}

function renderComment(comment: OutputComment, depth: number): string[] {
	const prefix = indent(depth);
	const lines = [
		`${prefix}/**`,
		`${prefix} * TODO(@cloudflare): cf migrate: ${sanitizeComment(comment.message)}`,
	];

	if (comment.docsUrl) {
		lines.push(`${prefix} * @see ${comment.docsUrl}`);
	}

	lines.push(`${prefix} */`);

	return lines;
}

function renderPropertyKey(key: string): string {
	return IDENTIFIER_PATTERN.test(key) ? key : JSON.stringify(key);
}

function renderValue(value: OutputValue, depth: number): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}

	if (Array.isArray(value)) {
		if (value.length === 0) {
			return "[]";
		}

		return [
			"[",
			...value.map(
				(entry) => `${indent(depth + 1)}${renderValue(entry, depth + 1)},`
			),
			`${indent(depth)}]`,
		].join("\n");
	}

	if (value.kind === "call") {
		return `${value.callee}(${value.args
			.map((argument) => renderValue(argument, depth))
			.join(", ")})`;
	}

	return renderObject(value, depth);
}

function renderObject(object: OutputObject, depth: number): string {
	if (
		object.properties.length === 0 &&
		(object.trailingComments?.length ?? 0) === 0
	) {
		return "{}";
	}

	const lines = ["{"];
	for (const property of object.properties) {
		for (const comment of property.comments ?? []) {
			lines.push(...renderComment(comment, depth + 1));
		}
		lines.push(
			`${indent(depth + 1)}${renderPropertyKey(property.key)}: ${renderValue(property.value, depth + 1)},`
		);
	}

	for (const comment of object.trailingComments ?? []) {
		lines.push(...renderComment(comment, depth + 1));
	}

	lines.push(`${indent(depth)}}`);

	return lines.join("\n");
}

function renderBranchReturn(branch: ConvertedBranch, depth: number): string[] {
	if (!branch.previewConfig) {
		return [`${indent(depth)}return ${renderObject(branch.config, depth)};`];
	}

	return [
		`${indent(depth)}if (ctx.isPreview) {`,
		`${indent(depth + 1)}return ${renderObject(branch.previewConfig, depth + 1)};`,
		`${indent(depth)}}`,
		`${indent(depth)}return ${renderObject(branch.config, depth)};`,
	];
}

function renderConfigExport(
	definer: string,
	base: ConvertedBranch,
	environments: Map<string, ConvertedBranch>
): string {
	if (environments.size === 0 && !base.previewConfig) {
		return `export default ${definer}(${renderObject(base.config, 0)});`;
	}

	const lines = [`export default ${definer}((ctx) => {`];
	if (environments.size === 0) {
		lines.push(...renderBranchReturn(base, 1));
	} else {
		lines.push("\tswitch (ctx.mode) {");
		for (const [name, branch] of environments) {
			lines.push(`\t\tcase ${JSON.stringify(name)}: {`);
			lines.push(...renderBranchReturn(branch, 3));
			lines.push("\t\t}");
		}
		lines.push("\t\tdefault: {");
		lines.push(...renderBranchReturn(base, 3));
		lines.push("\t\t}", "\t}");
	}

	lines.push("});");

	return lines.join("\n");
}

function renderInformationComment(message: string, docsUrl?: string): string {
	const lines = ["/**", ` * ${sanitizeComment(message)}`];
	if (docsUrl) {
		lines.push(` * @see ${docsUrl}`);
	}

	lines.push(" */");

	return lines.join("\n");
}

function renderMigrationGuard(followUps: MigrationFollowUp[]): string {
	const blockingFollowUps = followUps.filter(
		({ blocking: isBlocking }) => isBlocking
	);
	if (blockingFollowUps.length === 0) {
		return "";
	}

	return [
		renderInformationComment(
			"This migration needs manual work. Resolve every TODO in this file, then remove the error below."
		),
		...blockingFollowUps.map((followUp) =>
			renderComment(
				{
					docsUrl: followUp.docsUrl,
					message: followUp.sourcePath
						? `${followUp.sourcePath}: ${followUp.message}`
						: followUp.message,
				},
				0
			).join("\n")
		),
		'throw new Error("Migration incomplete. Resolve every cf migrate TODO in `cloudflare.config.ts`.");',
	].join("\n");
}

export function renderCloudflareConfig(
	converted: ConvertedWranglerConfig
): string {
	const imports = [...converted.imports, "defineConfig"].sort();
	const sections = [`import { ${imports.join(", ")} } from "cf/config";`];

	const warning = converted.followUps.find(
		({ code }) => code === "secret-files-not-migrated"
	);
	if (warning) {
		sections.push(renderInformationComment(warning.message, warning.docsUrl));
	}

	if (converted.environments.size > 0) {
		sections.push(
			renderInformationComment(
				"Wrangler environments are selected through ctx.mode and the cf --mode flag.",
				ENVIRONMENTS_DOCS_URL
			)
		);
	}

	const guard = renderMigrationGuard(converted.followUps);
	if (guard) {
		sections.push(guard);
	}

	sections.push(
		renderConfigExport("defineConfig", converted.base, converted.environments)
	);

	return `${sections.join("\n\n")}\n`;
}

export function renderWranglerConfig(
	converted: ConvertedWranglerConfig
): string | null {
	if (!converted.toolingBase && converted.toolingEnvironments.size === 0) {
		return null;
	}

	const emptyBranch: ConvertedBranch = {
		config: {
			kind: "object",
			properties: [],
		},
	};

	return `${[
		'import { defineWranglerConfig } from "wrangler/experimental-config";',
		renderConfigExport(
			"defineWranglerConfig",
			converted.toolingBase ?? emptyBranch,
			converted.toolingEnvironments
		),
	].join("\n\n")}\n`;
}
