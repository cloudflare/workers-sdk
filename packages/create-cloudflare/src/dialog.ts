import { relative } from "node:path";
import { hyperlink, logRaw, shapes, stripAnsi } from "@cloudflare/cli";
import { bgGreen, blue, gray } from "@cloudflare/cli/colors";
import { quoteShellArgs } from "helpers/command";
import { detectPackageManager } from "helpers/packageManagers";
import type { C3Args, C3Context } from "types";

/**
 * Wrap the lines with a border and inner padding
 */
export function createDialog(lines: string[]) {
	const screenWidth = process.stdout.columns;
	const maxLineWidth = Math.max(
		...lines.map((line) => stripAnsi(line).length),
		60, // Min inner width
	);
	const dividerWidth = Math.min(maxLineWidth, screenWidth);

	return [
		gray(shapes.dash).repeat(dividerWidth),
		...lines,
		gray(shapes.dash).repeat(dividerWidth),
		"",
	].join("\n");
}

export function printWelcomeMessage(
	version: string,
	telemetryEnabled: boolean,
	args: Partial<C3Args>,
) {
	const lines = [
		`👋 Welcome to create-cloudflare v${version}!`,
		`🧡 Let's get started.`,
	];

	if (args.experimental) {
		lines.push("", blue`🧪 Running in experimental mode`);
	}

	if (telemetryEnabled) {
		if (args.experimental) {
			lines.push("");
		}

		const telemetryDocsUrl = `https://github.com/cloudflare/workers-sdk/blob/main/packages/create-cloudflare/telemetry.md`;

		lines.push(
			`📊 Cloudflare collects telemetry about your usage of Create-Cloudflare.`,
			"",
			`Learn more at: ${blue.underline(hyperlink(telemetryDocsUrl))}`,
		);
	}

	const dialog = createDialog(lines);

	logRaw(dialog);
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

	// Prepare the dialog
	const lines = [
		`🎉 ${bgGreen(" SUCCESS ")} Application ${ctx.deployment.url ? "deployed" : "created"} successfully!`,
		``,
	];

	if (ctx.deployment.url && dashboardUrl) {
		lines.push(
			`🔍 View Project`,
			`${gray("Visit:")} ${blue.underline(hyperlink(ctx.deployment.url))}`,
			`${gray("Dash:")} ${blue.underline(hyperlink(dashboardUrl))}`,
			``,
		);
	}

	lines.push(
		`💻 Continue Developing`,
		...(cdCommand ? [`${gray("Change directories:")} ${blue(cdCommand)}`] : []),
		`${gray(ctx.deployment.url ? `Deploy again:` : "Deploy:")} ${blue(deployCommand)}`,
		``,
		`📖 Explore Documentation`,
		`${blue.underline(hyperlink(documentationUrl))}`,
		``,
		`🐛 Report an Issue`,
		`${blue.underline(hyperlink(reportIssueUrl))}`,
		``,
		`💬 Join our Community`,
		`${blue.underline(hyperlink(discordUrl))}`,
	);

	const dialog = createDialog(lines);

	// Print dialog
	logRaw(dialog);
};
