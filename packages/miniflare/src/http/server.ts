import fs from "fs/promises";
import { z } from "zod";
import {
	CORE_PLUGIN,
	HEADER_CF_BLOB,
	SERVICE_ENTRY,
	SOCKET_ENTRY,
} from "../plugins";
import { HttpOptions, Socket, Socket_Https } from "../runtime";
import { Awaitable } from "../workers";
import { CERT, KEY } from "./cert";

export async function configureEntrySocket(
	coreOpts: z.infer<typeof CORE_PLUGIN.sharedOptions>
): Promise<Socket> {
	const httpOptions = {
		// Even though we inject a `cf` object in the entry worker, allow it to
		// be customised via `dispatchFetch`
		cfBlobHeader: HEADER_CF_BLOB,
	};

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

	let options: { http: HttpOptions } | { https: Socket_Https };

	if (privateKey && certificateChain) {
		options = {
			https: {
				options: httpOptions,
				tlsOptions: {
					keypair: {
						privateKey: privateKey,
						certificateChain: certificateChain,
					},
				},
			},
		};
	} else {
		options = {
			http: httpOptions,
		};
	}

	return {
		name: SOCKET_ENTRY,
		service: { name: SERVICE_ENTRY },
		...options,
	};
}

function valueOrFile(
	value?: string,
	filePath?: string
): Awaitable<string | undefined> {
	return value ?? (filePath && fs.readFile(filePath, "utf8"));
}
