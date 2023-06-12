import { fetchResult } from "../cfetch";
import { withConfig } from "../config";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { takeName } from "./options";
import { constellationBetaWarning } from "./utils";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { Project } from "./types";

export function options(yargs: CommonYargsArgv) {
	return takeName(yargs)
		.positional("runtime", {
			describe: "The name of the runtime to use",
			type: "string",
			demandOption: true,
		})
		.epilogue(constellationBetaWarning);
}

type HandlerOptions = StrictYargsOptionsToInterface<typeof options>;
export const handler = withConfig<HandlerOptions>(
	async ({ name, runtime, config }): Promise<void> => {
		const accountId = await requireAuth(config);

		logger.log(constellationBetaWarning);

		let proj: Project;
		try {
			proj = await fetchResult(`/accounts/${accountId}/constellation/project`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					name,
					runtime,
				}),
			});
		} catch (e) {
			if ((e as { code: number }).code === 7409) {
				throw new Error("A project with that name already exists");
			}
			throw e;
		}

		logger.log(`✅ Successfully created Project "${proj.name}"!`);
	}
);
