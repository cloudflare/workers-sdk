import { relative } from "path";
import { endSection, log, logRaw, newline, shapes } from "@cloudflare/cli";
import { bgGreen, blue, dim, gray } from "@cloudflare/cli/colors";
import { openInBrowser } from "helpers/cli";
import { quoteShellArgs } from "helpers/command";
import { detectPackageManager } from "helpers/packageManagers";
import { poll } from "helpers/poll";
import type { C3Context } from "types";

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
