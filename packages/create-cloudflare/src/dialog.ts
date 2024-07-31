import { relative } from "path";
import {
	endSection,
	logRaw,
	newline,
	shapes,
	space,
	stripAnsi,
} from "@cloudflare/cli";
import { bgGreen, blue, gray } from "@cloudflare/cli/colors";
import { openInBrowser } from "helpers/cli";
import { quoteShellArgs } from "helpers/command";
import { detectPackageManager } from "helpers/packageManagers";
import { poll } from "helpers/poll";
import type { C3Context } from "types";

// To measure the actual spaces the message will occupy in the terminal
function getWidth(message: string): number {
	const singleSpace = " ";
	const text = stripAnsi(message)
		// This emoji occupy a single space
		.replace(/☁️/g, singleSpace)
		// These emojis occupies double space
		.replace(/🧡|💬|⚡/g, singleSpace.repeat(2));

	return text.length;
}

function printDialog(
	lines: string[],
	{
		prefix = space(),
	}: {
		prefix?: string;
	} = {},
) {
	// Derive the inner width based on the content
	const innerWidth = Math.max(
		...lines.map((line) => getWidth(line)),
		60, // Min width
	);
	const paddingLeft = 1;
	const paddingRight = 1;
	const topRow =
		gray(shapes.corners.tl) +
		gray(shapes.dash.repeat(innerWidth + paddingLeft + paddingRight)) +
		gray(shapes.corners.tr);
	const bottomRow =
		gray(shapes.corners.bl) +
		gray(shapes.dash.repeat(innerWidth + paddingLeft + paddingRight)) +
		gray(shapes.corners.br);
	const content = [
		topRow,
		...lines.map(
			(line) =>
				gray(shapes.bar) +
				space(paddingLeft) +
				line +
				space(innerWidth - getWidth(line)) +
				space(paddingRight) +
				gray(shapes.bar),
		),
		bottomRow,
	]
		.map((line) => prefix + line)
		.join("\n");

	logRaw(content);
}

export function printWelcomeMessage(version: string) {
	printDialog([
		`☁️  Welcome to create-cloudflare v${version}!`,
		`🧡 Let's get started.`,
	]);
}

export const printSummary = async (ctx: C3Context) => {
	const { npm } = detectPackageManager();
	const dashboardUrl = ctx.account
		? `https://dash.cloudflare.com/?to=/:account/workers/services/view/${ctx.project.name}`
		: null;
	const cdCommand = `cd ${relative(ctx.originalCWD, ctx.project.path)}`;
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

	const lines = [
		`🎉 ${bgGreen(" SUCCESS ")} Application ${ctx.deployment.url ? "created" : "deployed"} successfully!`,
		``,
	];

	if (ctx.deployment.url && dashboardUrl) {
		lines.push(
			`☁️  View Project`,
			`   ${gray("Visit:")} ${blue.underline(ctx.deployment.url)}`,
			`   ${gray("Dash:")} ${blue.underline(dashboardUrl)}`,
			``,
		);
	}

	lines.push(
		`🧡 Continue Developing`,
		`   ${gray("Change directories:")} ${blue(cdCommand)}`,
		`   ${gray("Start dev server:")} ${blue(devServerCommand)}`,
		`   ${gray(ctx.deployment.url ? `Deploy again:` : "Deploy:")} ${blue(deployCommand)}`,
		``,
		`⚡ Explore Documentation`,
		`   ${blue.underline(documentationUrl)}`,
		``,
		`💬 Join our Community`,
		`   ${blue.underline(discordUrl)}`,
		``,
	);

	printDialog(lines, {
		prefix: gray(shapes.bar),
	});
	newline();

	if (ctx.deployment.url) {
		const success = await poll(ctx.deployment.url);
		if (success) {
			if (ctx.args.open) {
				await openInBrowser(ctx.deployment.url);
			}
		}
	}

	endSection("See you again soon!");
	process.exit(0);
};
