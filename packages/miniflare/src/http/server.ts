import fs from "node:fs/promises";
import { z } from "zod";
import { CORE_PLUGIN } from "../plugins";
import { HttpOptions, Socket_Https } from "../runtime";
import { Awaitable } from "../workers";
import { CERT, KEY } from "./cert";

export async function getEntrySocketHttpOptions(
	coreOpts: z.infer<typeof CORE_PLUGIN.sharedOptions>
): Promise<{ http: HttpOptions } | { https: Socket_Https }> {
	let privateKey: string | undefined = undefined;
	let certificateChain: string | undefined = undefined;

	if (
		(coreOpts.httpsKey || coreOpts.httpsKeyPath) &&
		(coreOpts.httpsCert || coreOpts.httpsCertPath)
	) {
		privateKey = await valueOrFile(coreOpts.httpsKey, coreOpts.httpsKeyPath);
		certificateChain = await valueOrFile(
			coreOpts.httpsCert,
			coreOpts.httpsCertPath
		);
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

function valueOrFile(
	value?: string,
	filePath?: string
): Awaitable<string | undefined> {
	return value ?? (filePath && fs.readFile(filePath, "utf8"));
}
