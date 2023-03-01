import assert from "assert";
import { mkdtemp } from "fs/promises";
import shellac from "shellac";

import path from "path";
import os from "os";
import { normalizeOutput } from "./helpers/normalise";

assert(
	process.env.CLOUDFLARE_ACCOUNT_ID,
	"Please provide a CLOUDFLARE_ACCOUNT_ID as an environment variable"
);

function noHeader(output: string) {
	return output.split("----------------------------")[1];
}

const CF_ID = `CLOUDFLARE_ACCOUNT_ID=${process.env.CLOUDFLARE_ACCOUNT_ID}`;
const WRANGLER = process.env.WRANGLER ?? `npx wrangler@beta`;
const makeRoot = async () =>
	await mkdtemp(path.join(os.tmpdir(), "wrangler-smoke-"));

const RUN = `${CF_ID} ${WRANGLER}`;

function runIn(directory: string) {
	return async (...p: Parameters<ReturnType<typeof shellac["in"]>>) => {
		const { stdout, stderr } = await shellac.in(directory)(...p);
		return {
			stdout: normalizeOutput(stdout),
			stderr: normalizeOutput(stderr),
			raw: { stdout, stderr },
		};
	};
}
export { RUN, makeRoot, noHeader, runIn };
