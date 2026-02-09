import { UserError } from "@cloudflare/workers-utils";

type TunnelTokenPayload = {
	a: string;
	s: string;
	t: string;
	e?: string;
};

export type TunnelCredentialsFile = {
	AccountTag: string;
	TunnelSecret: string;
	TunnelID: string;
	Endpoint?: string;
};

export function decodeTunnelTokenToCredentialsFile(
	token: string
): TunnelCredentialsFile {
	let payload: TunnelTokenPayload;
	try {
		payload = JSON.parse(Buffer.from(token, "base64").toString("utf8")) as TunnelTokenPayload;
	} catch (e) {
		throw new UserError(
			`Provided tunnel token is not valid base64 JSON.\n\n` +
				`${e instanceof Error ? e.message : String(e)}`
		);
	}

	if (!payload?.a || !payload?.s || !payload?.t) {
		throw new UserError(`Provided tunnel token is missing required fields.`);
	}

	return {
		AccountTag: payload.a,
		TunnelSecret: payload.s,
		TunnelID: payload.t,
		Endpoint: payload.e,
	};
}
