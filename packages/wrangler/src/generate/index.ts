import { execa } from "execa";
import { getC3CommandFromEnv } from "../environment-variables/misc-variables";
import { getPackageManager } from "../package-manager";
import * as shellquote from "../utils/shell-quote";
import { logger } from "../logger";
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

export async function generateHandler() {
	logger.warn(
		`Deprecation: \`wrangler generate\` is deprecated.\n` +
			`Running \`npm create cloudflare@latest\` for you instead.\n` +
			`Any arguments passed to \`wrangler generate\` will be ignored.\n\n`
	);

	const packageManager = await getPackageManager(process.cwd());

	const c3Arguments = [
		...shellquote.parse(getC3CommandFromEnv()),
	];

	await execa(packageManager.type, c3Arguments, { stdio: "inherit" });
	return;
}

/**
 * There's no URL, so assume a github repo
 */
type NoUrl = {
	httpsUrl: undefined;
	gitUrl: undefined;
	shorthandUrl: undefined;
};

/**
 * A https url (e.g. https://bitbucket.org/user/repo)
 */
type HttpsUrl = Omit<NoUrl, "httpsUrl"> & { httpsUrl: string };

/**
 * A git url (e.g. git@gitlab.com:user/repo)
 */
type GitUrl = Omit<NoUrl, "gitUrl"> & { gitUrl: string };

/**
 * A shorthand url (e.g. github:user/repo)
 */
type ShorthandUrl = Omit<NoUrl, "shorthandUrl"> & { shorthandUrl: string };

/**
 * Union of all possible URL groups. Exactly one will be present, the rest
 * will be `undefined`.
 */
type TemplateRegexUrlGroup = NoUrl | HttpsUrl | GitUrl | ShorthandUrl;

/**
 * Possible matches of `TEMPLATE_REGEX` against a passed-in template arg
 */
type TemplateRegexGroups = {
	/** The user the repo is under */
	user: string;

	/** The repo name */
	repository: string;

	/** Optional, path to subdirectory containing template. Begins with `/` */
	subdirectoryPath?: string;

	/** Optional tag (or branch, etc.) to clone */
	tag?: string;
} & TemplateRegexUrlGroup;