import * as fs from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import parseChangesetFile from "@changesets/parse";
import dedent from "ts-dedent";
import type { Changeset } from "@changesets/types";
import type { PullRequestOpenedEvent } from "@octokit/webhooks-types";

const START_CHECKLIST_MARKER = "<!-- START_CHECKLIST";
const END_CHECKLIST_MARKER = "END_CHECKLIST -->";
const DESCRIBE_PLACEHOLDER = "_Describe your change..._";

if (require.main === module) {
	run().catch((error) => {
		core.setFailed(error);
	});
}

async function run() {
	core.info(dedent`
		Copy Changesets to PR
		=====================
	`);

	if (!isPullRequestEvent(context.payload)) {
		core.info("Not a pull request event, skipping.");
		return;
	}

	const { pull_request: pr } = context.payload;
	const body = pr.body ?? "";

	// Check if the description is empty (only contains template content)
	if (!isDescriptionEmpty(body)) {
		core.info("PR description has custom content, skipping.");
		return;
	}

	// Get added changesets from environment variable (set by dorny/paths-filter with list-files: json)
	// eslint-disable-next-line turbo/no-undeclared-env-vars
	const addedChangesetsEnv = process.env.ADDED_CHANGESETS ?? "[]";
	let addedFiles: string[];
	try {
		addedFiles = JSON.parse(addedChangesetsEnv) as string[];
	} catch {
		core.warning(
			`Failed to parse ADDED_CHANGESETS as JSON: ${addedChangesetsEnv}`
		);
		return;
	}

	if (addedFiles.length === 0) {
		core.info("No added changesets found, skipping.");
		return;
	}

	core.info(
		`Found ${addedFiles.length} added changeset(s): ${addedFiles.join(", ")}`
	);

	// Read and parse the added changesets
	const changesets = readChangesets(addedFiles);

	if (changesets.length === 0) {
		core.info("No valid changesets found after parsing, skipping.");
		return;
	}

	// Build the new description
	const changesetContent = formatChangesets(changesets);
	const newBody = insertChangesets(body, changesetContent);

	// Update the PR
	const token = core.getInput("github_token", { required: true });
	const octokit = getOctokit(token);

	await octokit.rest.pulls.update({
		owner: context.repo.owner,
		repo: context.repo.repo,
		pull_number: pr.number,
		body: newBody,
	});

	core.info("Successfully updated PR description with changesets.");
}

/**
 * Check if the description section is empty.
 *
 * To determine this, we:
 * 1. Strip the checklist (content between START_CHECKLIST and END_CHECKLIST markers)
 * 2. Strip the "_Describe your change..._" placeholder
 * 3. Strip "---" separators
 * 4. Strip empty lines
 *
 * If only 1 or fewer non-empty lines remain, the description is considered empty.
 */
function isDescriptionEmpty(body: string): boolean {
	let content = body;

	// Remove checklist section (between markers, inclusive)
	const startIdx = content.indexOf(START_CHECKLIST_MARKER);
	const endIdx = content.indexOf(END_CHECKLIST_MARKER);

	if (startIdx !== -1 && endIdx !== -1) {
		content =
			content.slice(0, startIdx) +
			content.slice(endIdx + END_CHECKLIST_MARKER.length);
	}

	// Process line by line
	const lines = content.split("\n");
	const meaningfulLines = lines.filter((line) => {
		const trimmed = line.trim();

		// Skip empty lines
		if (trimmed === "") {
			return false;
		}

		// Skip the placeholder text
		if (trimmed === DESCRIBE_PLACEHOLDER) {
			return false;
		}

		// Skip separator lines
		if (trimmed === "---") {
			return false;
		}

		return true;
	});

	// Consider empty if 1 or fewer meaningful lines remain
	// (the "Fixes #..." line is expected to remain)
	return meaningfulLines.length <= 1;
}

/**
 * Insert changeset content into the PR body.
 * If the placeholder is present, replace it. Otherwise, prepend to the body.
 */
function insertChangesets(body: string, changesetContent: string): string {
	if (body.includes(DESCRIBE_PLACEHOLDER)) {
		return body.replace(DESCRIBE_PLACEHOLDER, changesetContent);
	}
	// Prepend changesets when placeholder is not present
	return `${changesetContent}\n\n${body}`;
}

/**
 * Read and parse changeset files from the given paths using @changesets/parse
 */
function readChangesets(filePaths: string[]): Changeset[] {
	const changesets: Changeset[] = [];

	for (const filePath of filePaths) {
		const fullPath = path.join(process.cwd(), filePath);

		if (!fs.existsSync(fullPath)) {
			core.warning(`Changeset file not found: ${fullPath}`);
			continue;
		}

		const content = fs.readFileSync(fullPath, "utf-8");
		try {
			const parsed = parseChangesetFile(content);
			if (parsed.releases.length > 0) {
				changesets.push(parsed);
			}
		} catch (e) {
			core.warning(`Failed to parse changeset ${filePath}: ${e}`);
		}
	}

	return changesets;
}

/**
 * Format changesets for display in the PR description
 */
function formatChangesets(changesets: Changeset[]): string {
	const parts = changesets.map((cs, idx) => {
		const packageInfo = cs.releases
			.map((r) => `\`${r.name}\` (${r.type})`)
			.join(", ");

		return dedent`
			#### Changeset ${idx + 1}
			**Packages:** ${packageInfo}

			${cs.summary}
		`;
	});

	return parts.join("\n\n");
}

/**
 * Type guard to check if the payload is a PullRequestOpenedEvent
 */
function isPullRequestEvent(
	payload: object
): payload is PullRequestOpenedEvent {
	return (
		payload &&
		"action" in payload &&
		payload.action === "opened" &&
		"pull_request" in payload &&
		!!payload.pull_request
	);
}

export { isDescriptionEmpty, insertChangesets, formatChangesets };
