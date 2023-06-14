import assert from "node:assert";
import shellac from "shellac";
import { normalizeOutput } from "./normalise";

assert(
	process.env.CLOUDFLARE_ACCOUNT_ID,
	"Please provide a CLOUDFLARE_ACCOUNT_ID as an environment variable"
);

const RUN = process.env.WRANGLER ?? `npx --prefer-offline wrangler@beta`;

function runIn(
	directory: string,
	replacers?: Parameters<typeof normalizeOutput>[1]
) {
	return async (...p: Parameters<ReturnType<typeof shellac["in"]>>) => {
		const { stdout, stderr } = await shellac.env(process.env).in(directory)(
			...p
		);
		return {
			stdout: normalizeOutput(stdout, replacers),
			stderr: normalizeOutput(stderr, replacers),
			raw: { stdout, stderr },
		};
	};
}

function runInBg(
	directory: string,
	replacers?: Parameters<typeof normalizeOutput>[1]
) {
	return async (...p: Parameters<typeof shellac["bg"]>) => {
		const { pid, promise } = await shellac
			.env(process.env)
			.in(directory)
			.bg(...p);
		return {
			pid,
			promise: promise.then(({ stdout, stderr }) => ({
				stdout: normalizeOutput(stdout, replacers),
				stderr: normalizeOutput(stderr, replacers),
				raw: { stdout, stderr },
			})),
		};
	};
}
export { RUN, runIn, runInBg };
