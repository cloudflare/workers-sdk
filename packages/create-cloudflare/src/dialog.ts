import { relative } from "node:path";
import { logRaw } from "@cloudflare/cli-shared-helpers";
import { printBanner } from "@cloudflare/cli-shared-helpers/banner";
import { brandBox, successBox } from "@cloudflare/cli-shared-helpers/box";
import { blue, gray } from "@cloudflare/cli-shared-helpers/colors";
import { quoteShellArgs } from "@cloudflare/cli-shared-helpers/command";
import { detectPackageManager } from "helpers/packageManagers";
import type { C3Args, C3Context } from "types";

/**
 * Render lines as a branded panel.
 *
 * Used for any multi-line panel content that warrants a box. The
 * slim "name + version" welcome banner uses `printBanner` from
 * cli-shared-helpers instead.
 */
export function createDialog(lines: string[], title?: string) {
	return brandBox(lines.join("\n"), title);
}

export async function printWelcomeMessage(
	version: string,
	telemetryEnabled: boolean,
	args: Partial<C3Args>
) {
	// Slim wrangler-style banner: `👋 create-cloudflare 2.67.4` over a
	// Tangerine underline. C3 has its own update check (see
	// helpers/cli.ts isUpdateAvailable), so disable the shared one.
	await printBanner({
		name: "create-cloudflare",
		version,
		emoji: "👋",
		skipUpdateCheck: true,
	});

	if (args.experimental) {
		logRaw(blue("🧪 Running in experimental mode"));
	}

	if (telemetryEnabled) {
		// Plain URL — modern terminals auto-link it, and embedding the OSC
		// 8 hyperlink escape sequences breaks boxen's width calculations
		// downstream (see printSummary).
		const telemetryDocsUrl = `https://github.com/cloudflare/workers-sdk/blob/main/packages/create-cloudflare/telemetry.md`;
		logRaw(
			`📊 Cloudflare collects telemetry about your usage of Create-Cloudflare.`
		);
		logRaw(`Learn more at: ${blue.underline(telemetryDocsUrl)}`);
	}
}

export const printSummary = (ctx: C3Context) => {
	// Prepare relevant information
	const dashboardUrl = ctx.account
		? `https://dash.cloudflare.com/?to=/:account/workers/services/view/${ctx.project.name}/production`
		: null;
	const relativePath = relative(ctx.originalCWD, ctx.project.path);
	const cdCommand = relativePath ? `cd ${relativePath}` : null;
	const { npm } = detectPackageManager();

	const deployCommand = quoteShellArgs([
		npm,
		"run",
		ctx.template.deployScript ?? "deploy",
	]);
	const documentationUrl = `https://developers.cloudflare.com/${ctx.template.platform}`;
	const discordUrl = `https://discord.cloudflare.com`;
	const reportIssueUrl =
		"https://github.com/cloudflare/workers-sdk/issues/new/choose";

	// Build a success summary, rendered inside a green rounded box
	// (boxen).
	const lines = [
		`🎉 Application ${ctx.deployment.url ? "deployed" : "created"} successfully!`,
		``,
	];

	// URLs are printed as plain text (not wrapped in OSC 8 hyperlink
	// escape sequences) — modern terminals auto-detect and link them,
	// and the hyperlink escapes confuse boxen's width calculation,
	// causing RangeError on long URLs.
	if (ctx.deployment.url && dashboardUrl) {
		lines.push(
			`🔍 View Project`,
			`${gray("Visit:")} ${blue.underline(ctx.deployment.url)}`,
			`${gray("Dash:")} ${blue.underline(dashboardUrl)}`,
			``
		);
	}

	lines.push(
		`💻 Continue Developing`,
		...(cdCommand ? [`${gray("Change directories:")} ${blue(cdCommand)}`] : []),
		`${gray(ctx.deployment.url ? "Deploy again:" : "Deploy:")} ${blue(deployCommand)}`,
		``,
		`📖 Explore Documentation`,
		`${blue.underline(documentationUrl)}`,
		``,
		`🐛 Report an Issue`,
		`${blue.underline(reportIssueUrl)}`,
		``,
		`💬 Join our Community`,
		`${blue.underline(discordUrl)}`
	);

	logRaw(successBox(lines.join("\n")));
};
