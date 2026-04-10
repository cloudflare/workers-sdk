import { JsonFriendlyFatalError, UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../core/create-command";
import { select } from "../dialogs";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import openInBrowser from "../open-in-browser";
import { requireAuth } from "../user";
import { fetchBrowserRendering } from "./utils";
import type { BrowserSession, BrowserTarget } from "./types";

function throwIfNonInteractive(message: string, json: boolean): void {
	if (json) {
		throw new JsonFriendlyFatalError(JSON.stringify({ error: message }));
	}
	if (isNonInteractiveOrCI()) {
		throw new UserError(message);
	}
}

/**
 * Find a target by selector. Matches in order:
 * 1. Exact match on id
 * 2. Contains match on url
 * 3. Contains match on title (case-insensitive)
 */
function findTargetBySelector(
	targets: BrowserTarget[],
	selector: string
): BrowserTarget[] {
	// First try exact match on id
	const byId = targets.filter((t) => t.id === selector);
	if (byId.length > 0) {
		return byId;
	}

	// Then try contains match on url
	const byUrl = targets.filter((t) => t.url?.includes(selector));
	if (byUrl.length > 0) {
		return byUrl;
	}

	// Finally try contains match on title (case-insensitive)
	const selectorLower = selector.toLowerCase();
	const byTitle = targets.filter((t) =>
		t.title?.toLowerCase().includes(selectorLower)
	);
	return byTitle;
}

/**
 * Format a target for display in the selection list.
 */
function formatTargetForDisplay(target: BrowserTarget): string {
	if (target.url && target.title) {
		return `${target.title} (${target.url})`;
	}
	if (target.title) {
		return target.title;
	}
	if (target.url) {
		return target.url;
	}
	return target.id;
}

/**
 * Format a session for display in the selection list.
 */
function formatSessionForDisplay(session: BrowserSession): string {
	const date = new Date(session.startTime);
	const dateStr = date.toLocaleString();
	return `${session.sessionId} (started ${dateStr})`;
}

/**
 * View a live browser session with auto-selection:
 * - Session: uses provided ID, auto-selects if one exists, prompts/errors if multiple
 * - Target: uses --target selector, auto-selects single page, prompts/errors if multiple
 * - Output: --open (default in interactive) opens browser, otherwise prints URL
 */
export const browserViewCommand = createCommand({
	metadata: {
		description: "View a live browser session",
		status: "open beta",
		owner: "Product: Browser Rendering",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	positionalArgs: ["sessionId"],
	args: {
		sessionId: {
			type: "string",
			description:
				"The session ID to inspect (optional if only one session exists)",
		},
		target: {
			type: "string",
			description:
				"Target selector (matches id exactly, or url/title by substring)",
		},
		json: {
			type: "boolean",
			description: "Return live browser session URL(s) as JSON",
			default: false,
		},
		open: {
			type: "boolean",
			description: "Open in browser (default: true in interactive mode)",
		},
	},
	async handler(
		{ sessionId: providedSessionId, target: targetSelector, json, open },
		{ config }
	) {
		const accountId = await requireAuth(config);

		let sessionId: string;

		if (providedSessionId) {
			// Session ID was provided explicitly
			sessionId = providedSessionId;
		} else {
			// No session ID provided - fetch available sessions and select
			const sessions = await fetchBrowserRendering<BrowserSession[]>(
				config,
				`/accounts/${accountId}/browser-rendering/devtools/session`
			);

			if (sessions.length === 0) {
				throw new UserError(
					"No active browser rendering sessions found. Use `wrangler browser create` to create one."
				);
			}

			if (sessions.length === 1) {
				// Auto-select the only session
				sessionId = sessions[0].sessionId;
			} else {
				// Multiple sessions - need to select
				throwIfNonInteractive(
					"Multiple sessions found. Provide a session ID explicitly.",
					json
				);
				sessionId = await select<string>("Select a session:", {
					choices: sessions.map((s) => ({
						title: formatSessionForDisplay(s),
						value: s.sessionId,
					})),
					defaultOption: 0,
				});
			}
		}

		const targets = await fetchBrowserRendering<BrowserTarget[]>(
			config,
			`/accounts/${accountId}/browser-rendering/devtools/browser/${sessionId}/json`
		);

		if (targets.length === 0) {
			throw new UserError(`No targets found for session "${sessionId}"`);
		}

		// Filter to page targets only for selection (unless using --target which searches all)
		const pageTargets = targets.filter((t) => t.type === "page");
		const selectableTargets = pageTargets.length > 0 ? pageTargets : targets;

		let selectedTarget: BrowserTarget;

		if (targetSelector) {
			// User provided a target selector
			const matchedTargets = findTargetBySelector(targets, targetSelector);

			if (matchedTargets.length === 0) {
				throw new UserError(
					`No target found matching "${targetSelector}". Available targets:\n${targets
						.map((t) => `  - ${t.id}: ${formatTargetForDisplay(t)}`)
						.join("\n")}`
				);
			}

			if (matchedTargets.length > 1) {
				throw new UserError(
					`Multiple targets match "${targetSelector}". Please be more specific:\n${matchedTargets
						.map((t) => `  - ${t.id}: ${formatTargetForDisplay(t)}`)
						.join("\n")}`
				);
			}

			selectedTarget = matchedTargets[0];
		} else if (selectableTargets.length === 1) {
			// Only one target, use it directly
			selectedTarget = selectableTargets[0];
		} else {
			// Multiple targets, need to select
			throwIfNonInteractive(
				"Multiple targets found. Use --target <selector> to specify which one.",
				json
			);
			const selectedId = await select<string>(
				`Multiple targets found. Select a target:`,
				{
					choices: selectableTargets.map((t) => ({
						title: formatTargetForDisplay(t),
						value: t.id,
					})),
					defaultOption: 0,
				}
			);

			const found = selectableTargets.find((t) => t.id === selectedId);
			if (!found) {
				throw new UserError(`Target "${selectedId}" not found`);
			}
			selectedTarget = found;
		}

		// defaults to true for interactive non-JSON mode
		const shouldOpen = open ?? (!json && !isNonInteractiveOrCI());

		if (json) {
			logger.json(selectedTarget);
		} else if (selectedTarget.devtoolsFrontendUrl) {
			if (shouldOpen) {
				logger.log(`Opening live browser session "${sessionId}"...`);
				await openInBrowser(selectedTarget.devtoolsFrontendUrl);
			} else {
				// Print raw URL for piping/scripting
				logger.log(selectedTarget.devtoolsFrontendUrl);
			}
		} else {
			logger.log(
				`No live browser session URL available for target "${selectedTarget.id}" in session ${sessionId}`
			);
		}
	},
});
