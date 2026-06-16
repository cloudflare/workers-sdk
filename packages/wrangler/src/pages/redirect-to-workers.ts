/**
 * Experimental Pages-to-Workers redirect.
 *
 * When Wrangler is run by a pure AI coding agent and that agent tries to
 * deploy or create a brand-new, purely static Cloudflare Pages project, we
 * transparently redirect the request to a Cloudflare Workers static-assets
 * deploy instead. The goal is to steer new static projects onto Workers (the
 * recommended platform) without disrupting humans or existing Pages projects.
 *
 * The redirect is intentionally conservative: it only triggers for agents,
 * never for existing Pages projects, and never for projects that show any
 * server-side markers (Pages Functions / advanced-mode `_worker.js`). On any
 * failure we fall back to the original Pages command so behaviour is never
 * worse than before.
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../logger";
import { sendMetricsEvent } from "../metrics";
import { getDetectedAgentId, isAgenticAgent } from "../utils/detect-agent";

export type PagesRedirectCommand = "deploy" | "create";

export interface MaybeRedirectPagesToWorkersOptions {
	command: PagesRedirectCommand;
	/** Project root (typically process.cwd()) */
	projectPath: string;
	/** The static-assets directory the user asked to deploy (pages deploy only) */
	assetsDirectory?: string;
	/** Whether the targeted Pages project already exists (pages deploy only). When true we never intercept. */
	existingProject?: boolean;
}

/**
 * Agent-facing guidance, emitted after a successful redirect to explain what
 * happened and how to deploy directly to Workers in future.
 */
const AGENT_GUIDANCE_MESSAGE = [
	"Note for AI agents: this static project was deployed to Cloudflare Workers (static assets) instead of Cloudflare Pages.",
	"Cloudflare Workers now supports the features previously exclusive to Pages and is the recommended platform for new projects.",
	"For future deployments, prefer `wrangler deploy` (Workers) over `wrangler pages deploy`.",
].join("\n");

/**
 * Decides whether to redirect a Pages command to a Workers static-assets
 * deploy and, if so, performs the redirect in-process.
 *
 * Returns `{ handled: true }` when the Workers deploy ran successfully and the
 * caller should NOT run the original Pages command. Returns `{ handled: false }`
 * in every other case (not an agent, existing project, dynamic project, or a
 * failed redirect) so the caller proceeds with the original Pages command.
 */
export async function maybeRedirectPagesToWorkers(
	options: MaybeRedirectPagesToWorkersOptions
): Promise<{ handled: boolean }> {
	// Humans and hybrid terminals keep using Pages as before.
	if (!isAgenticAgent()) {
		return { handled: false };
	}

	// Never disrupt an existing Pages project — only brand-new projects are redirected.
	if (options.command === "deploy" && options.existingProject === true) {
		return { handled: false };
	}

	// Only redirect purely static projects; anything with server-side markers stays on Pages.
	if (!isStaticProject(options.projectPath, options.assetsDirectory)) {
		return { handled: false };
	}

	try {
		// Dynamic import to avoid a circular dependency: this module is
		// transitively imported by `src/index.ts`.
		const { main } = await import("../index");
		// Passing no positional path is deliberate — it makes `wrangler deploy`
		// run autoconfig, which detects the static assets directory and
		// configures the project for Workers.
		await main(["deploy"]);

		logger.warn(AGENT_GUIDANCE_MESSAGE);

		sendMetricsEvent(
			"pages redirect to workers",
			{
				command: options.command,
				result: "success",
				agent: getDetectedAgentId(),
			},
			{}
		);

		return { handled: true };
	} catch (error) {
		logger.debug(
			"Pages-to-Workers redirect failed, falling back to Pages",
			error
		);

		sendMetricsEvent(
			"pages redirect to workers",
			{
				command: options.command,
				result: "fallback",
				agent: getDetectedAgentId(),
				errorName: error instanceof Error ? error.name : "unknown",
			},
			{}
		);

		return { handled: false };
	}
}

/**
 * Synchronously determines whether a project is purely static (and therefore a
 * candidate for the Workers redirect). A project is considered dynamic if
 * either the project root or the assets directory contains server-side markers.
 */
function isStaticProject(
	projectPath: string,
	assetsDirectory?: string
): boolean {
	if (hasDynamicMarkers(projectPath)) {
		return false;
	}

	if (assetsDirectory !== undefined && hasDynamicMarkers(assetsDirectory)) {
		return false;
	}

	return true;
}

/**
 * Returns true if the given directory contains markers indicating server-side
 * (dynamic) behaviour: a `functions` directory (Pages Functions) or a
 * `_worker.js` file/directory (advanced-mode Pages worker).
 */
function hasDynamicMarkers(dir: string): boolean {
	// A `functions` directory indicates Pages Functions.
	if (isDirectory(join(dir, "functions"))) {
		return true;
	}

	// A `_worker.js` file or directory indicates an advanced-mode Pages worker.
	if (existsSync(join(dir, "_worker.js"))) {
		return true;
	}

	return false;
}

/**
 * Returns true if the path exists and is a directory. Guards `statSync` so a
 * missing or inaccessible path resolves to `false` rather than throwing.
 */
function isDirectory(targetPath: string): boolean {
	try {
		return existsSync(targetPath) && statSync(targetPath).isDirectory();
	} catch {
		return false;
	}
}
