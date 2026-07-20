import { CERT, KEY } from "./cert";
import type { CORE_PLUGIN } from "../plugins";
import type { HttpOptions, Socket_Https } from "../runtime";
import type { z } from "zod";

export async function getEntrySocketHttpOptions(
	coreOpts: z.infer<typeof CORE_PLUGIN.sharedOptions>
): Promise<{ http: HttpOptions } | { https: Socket_Https }> {
	let privateKey: string | undefined = undefined;
	let certificateChain: string | undefined = undefined;

	if (coreOpts.httpsKey && coreOpts.httpsCert) {
		privateKey = coreOpts.httpsKey;
		certificateChain = coreOpts.httpsCert;
	} else if (coreOpts.https) {
		privateKey = KEY;
		certificateChain = CERT;
	}

	if (privateKey && certificateChain) {
		return {
			https: {
				tlsOptions: {
					keypair: {
						privateKey: privateKey,
						certificateChain: certificateChain,
					},
				},
			},
		};
	} else {
		return { http: {} };
	}
}
