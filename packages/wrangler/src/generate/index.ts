import { execa } from "execa";
import { getC3CommandFromEnv } from "../environment-variables/misc-variables";
import { logger } from "../logger";
import { getPackageManager } from "../package-manager";
import * as shellquote from "../utils/shell-quote";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export function generateOptions(yargs: CommonYargsArgv) {
	return yargs
		.positional("name", {
			describe: "Name of the Workers project",
			type: "string",
			demandOption: true,
		})
		.positional("template", {
			type: "string",
			describe: "The URL of a GitHub template",
		})
		.option("type", {
			alias: "t",
			type: "string",
			hidden: true,
			deprecated: true,
		})
		.option("site", {
			alias: "s",
			type: "boolean",
			hidden: true,
			deprecated: true,
		});
}
type GenerateArgs = StrictYargsOptionsToInterface<typeof generateOptions>;

export async function generateHandler(args: GenerateArgs) {
	logger.warn(
		`Deprecation: \`wrangler generate\` is deprecated.\n` +
			`Running \`npm create cloudflare@latest\` for you instead.\n`
	);

	const packageManager = await getPackageManager(process.cwd());
	const template = args.template;

	const c3Arguments = [
		...shellquote.parse(getC3CommandFromEnv()),
		...(packageManager.type === "npm" ? ["--"] : []),
	];

	if (template) {
		c3Arguments.push(`--template`);
		c3Arguments.push(template);
	}

	await execa(packageManager.type, c3Arguments, { stdio: "inherit" });
	return;
}
