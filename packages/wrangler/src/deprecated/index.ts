import { createCLIParser } from "../index";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export function buildOptions(yargs: CommonYargsArgv) {
	return yargs;
}
type BuildArgs = StrictYargsOptionsToInterface<typeof buildOptions>;
export async function buildHandler(buildArgs: BuildArgs) {
	await createCLIParser([
		"deploy",
		"--dry-run",
		"--outdir=dist",
		...(buildArgs.env ? ["--env", buildArgs.env] : []),
		...(buildArgs.config ? ["--config", buildArgs.config] : []),
		...(buildArgs.experimentalVersions ? ["--experimental-versions"] : []),
	]).parse();
}
