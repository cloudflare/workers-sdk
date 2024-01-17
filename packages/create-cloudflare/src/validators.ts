import type { Arg } from "@cloudflare/cli/interactive";

/**
 * unreadable regex copied from wrangler, which was basically copied from degit. i put some named capture
 * groups in, but uhh...there's not much to do short of using pomsky or some other tool.
 *
 * notably: this only supports `https://` and `git@` urls,
 * and is missing support for:
 * - `http`
 * - `ftp(s)`
 * - `file`
 * - `ssh`
 */
const TEMPLATE_REGEX =
	/^(?:(?:https:\/\/)?(?<httpsUrl>[^:/]+\.[^:/]+)\/|git@(?<gitUrl>[^:/]+)[:/]|(?<shorthandUrl>[^/]+):)?(?<user>[^/\s]+)\/(?<repository>[^/\s#]+)(?:(?<subdirectoryPath>(?:\/[^/\s#]+)+))?(?:\/)?(?:#(?<tag>.+))?/;

export const validateTemplateUrl = (value: Arg) => {
	if (!String(value).match(TEMPLATE_REGEX)) {
		return "Please enter a valid url.";
	}
};
