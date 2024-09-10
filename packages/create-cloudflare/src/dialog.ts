import { relative } from "path";
import {
	hyperlink,
	linkRegex,
	logRaw,
	shapes,
	space,
	stripAnsi,
} from "@cloudflare/cli";
import { bgGreen, blue, gray } from "@cloudflare/cli/colors";
import { quoteShellArgs } from "helpers/command";
import { detectPackageManager } from "helpers/packageManagers";
import type { C3Context } from "types";

/**
 * Wrap the lines with a border and inner padding
 */
export function createDialog(
	lines: string[],
	{
		maxWidth = process.stdout.columns,
	}: {
		maxWidth?: number;
	} = {},
) {
	const prefix = space();
	const border = shapes.bar;
	const padding = " ";
	const paddingWidth = padding.length * 2;
	const borderWidth = border.length * 2;
	const dialogWidth = paddingWidth + borderWidth + stripAnsi(prefix).length;
	const ellipses = "...";

	// Derive the outer width based on the content and max width
	let innerWidth = Math.max(
		...lines.map((line) => stripAnsi(line).length),
		60, // Min inner width
	);

	const maxInnerWidth = maxWidth - dialogWidth;

	// Limit the innerWidth to avoid overflow
	if (innerWidth > maxInnerWidth) {
		innerWidth = maxInnerWidth;
	}

	const topRow =
		gray(shapes.corners.tl) +
		gray(shapes.dash.repeat(innerWidth + paddingWidth)) +
		gray(shapes.corners.tr);
	const bottomRow =
		gray(shapes.corners.bl) +
		gray(shapes.dash.repeat(innerWidth + paddingWidth)) +
		gray(shapes.corners.br);

	return [
		prefix + topRow,
		...lines.map((line) => {
			let lineWidth = stripAnsi(line).length;

			if (lineWidth > maxInnerWidth) {
				// Truncate the label of the hyperlinks to avoid overflow
				// Note: This assumes the label to have no ANSI code at the moment
				line = line.replaceAll(linkRegex, (_, url, label) =>
					hyperlink(
						url,
						label.slice(
							0,
							label.length - (lineWidth - maxInnerWidth) - ellipses.length,
						) + ellipses,
					),
				);
				lineWidth = stripAnsi(line).length;
			}

			if (lineWidth > maxInnerWidth) {
				// If there is no link, truncate the text instead
				// FIXME: This assumes the text to have no ANSI code at the moment
				line =
					line.slice(0, innerWidth - lineWidth - ellipses.length) + ellipses;
				lineWidth = stripAnsi(line).length;
			}

			return (
				prefix +
				gray(border) +
				padding +
				line +
				padding.repeat(innerWidth > lineWidth ? innerWidth - lineWidth : 0) +
				padding +
				gray(border)
			);
		}),
		prefix + bottomRow,
	].join("\n");
}

export function printWelcomeMessage(
	version: string,
	telemetryEnabled: boolean,
) {
	const lines = [
		`👋 Welcome to create-cloudflare v${version}!`,
		`🧡 Let's get started.`,
	];

	if (telemetryEnabled) {
		lines.push(
			`📊 Cloudflare collects telemetry about your usage of Create-Cloudflare to improve the experience.`,
			`   Read more / opt out at [link to data policy]`,
		);
	}

	const dialog = createDialog(lines);

	logRaw(dialog);
}

export const printSummary = (ctx: C3Context) => {
	// Prepare relevant information
	const dashboardUrl = ctx.account
		? `https://dash.cloudflare.com/?to=/:account/workers/services/view/${ctx.project.name}`
		: null;
	const relativePath = relative(ctx.originalCWD, ctx.project.path);
	const cdCommand = relativePath ? `cd ${relativePath}` : null;
	const { npm } = detectPackageManager();
	const devServerCommand = quoteShellArgs([
		npm,
		"run",
		ctx.template.devScript ?? "start",
	]);
	const deployCommand = quoteShellArgs([
		npm,
		"run",
		ctx.template.deployScript ?? "deploy",
	]);
	const documentationUrl = `https://developers.cloudflare.com/${ctx.template.platform}`;
	const discordUrl = `https://discord.cloudflare.com`;

	// Prepare the dialog
	const lines = [
		`🎉 ${bgGreen(" SUCCESS ")} Application ${ctx.deployment.url ? "deployed" : "created"} successfully!`,
		``,
	];

	if (ctx.deployment.url && dashboardUrl) {
		lines.push(
			`🔍 View Project`,
			`   ${gray("Visit:")} ${blue.underline(hyperlink(ctx.deployment.url))}`,
			`   ${gray("Dash:")} ${blue.underline(hyperlink(dashboardUrl))}`,
			``,
		);
	}

	lines.push(
		`💻 Continue Developing`,
		...(cdCommand
			? [`   ${gray("Change directories:")} ${blue(cdCommand)}`]
			: []),
		`   ${gray("Start dev server:")} ${blue(devServerCommand)}`,
		`   ${gray(ctx.deployment.url ? `Deploy again:` : "Deploy:")} ${blue(deployCommand)}`,
		``,
		`📖 Explore Documentation`,
		`   ${blue.underline(hyperlink(documentationUrl))}`,
		``,
		`💬 Join our Community`,
		`   ${blue.underline(hyperlink(discordUrl))}`,
	);

	const dialog = createDialog(lines);

	// Print dialog
	logRaw(dialog);
};
