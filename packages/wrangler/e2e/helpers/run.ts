import assert from "node:assert";
import shellac from "shellac";
import { normalizeOutput } from "./normalise";

assert(
	process.env.CLOUDFLARE_ACCOUNT_ID,
	"Please provide a CLOUDFLARE_ACCOUNT_ID as an environment variable"
);

const CF_ID = `CLOUDFLARE_ACCOUNT_ID=${process.env.CLOUDFLARE_ACCOUNT_ID}`;
const WRANGLER = process.env.WRANGLER ?? `npx wrangler@beta`;

const RUN = `${CF_ID} ${WRANGLER}`;

function runIn(
	directory: string,
	replacers?: Parameters<typeof normalizeOutput>[1]
) {
	return async (...p: Parameters<ReturnType<typeof shellac["in"]>>) => {
		const { stdout, stderr } = await shellac.in(directory)(...p);
		return {
			stdout: normalizeOutput(stdout, replacers),
			stderr: normalizeOutput(stderr, replacers),
			raw: { stdout, stderr },
		};
	};
}
export { RUN, runIn };
