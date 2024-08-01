import { relative } from "path";
import {
	endSection,
	log,
	logRaw,
	newline,
	shapes,
	space,
	stripAnsi,
} from "@cloudflare/cli";
import { bgGreen, blue, dim, gray } from "@cloudflare/cli/colors";
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
		.replace(/🧡/g, singleSpace.repeat(2));

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

	const dirRelativePath = relative(ctx.originalCWD, ctx.project.path);
	const nextSteps = [
		...(dirRelativePath
			? [["Navigate to the new directory", `cd ${dirRelativePath}`]]
			: []),
		[
			"Run the development server",
			quoteShellArgs([npm, "run", ctx.template.devScript ?? "start"]),
		],
		...(ctx.template.previewScript
			? [
					[
						"Preview your application",
						quoteShellArgs([npm, "run", ctx.template.previewScript]),
					],
				]
			: []),
		[
			"Deploy your application",
			quoteShellArgs([npm, "run", ctx.template.deployScript ?? "deploy"]),
		],
		[
			"Read the documentation",
			`https://developers.cloudflare.com/${ctx.template.platform}`,
		],
		["Stuck? Join us at", "https://discord.cloudflare.com"],
	];

	if (ctx.deployment.url) {
		const msg = [
			`${gray(shapes.leftT)}`,
			`${bgGreen(" SUCCESS ")}`,
			`${dim("View your deployed application at")}`,
			`${blue(ctx.deployment.url)}`,
		].join(" ");
		logRaw(msg);
	} else {
		const msg = [
			`${gray(shapes.leftT)}`,
			`${bgGreen(" APPLICATION CREATED ")}`,
			`${dim("Deploy your application with")}`,
			`${blue(
				quoteShellArgs([npm, "run", ctx.template.deployScript ?? "deploy"]),
			)}`,
		].join(" ");
		logRaw(msg);
	}

	newline();
	nextSteps.forEach((entry) => {
		log(`${dim(entry[0])} ${blue(entry[1])}`);
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
