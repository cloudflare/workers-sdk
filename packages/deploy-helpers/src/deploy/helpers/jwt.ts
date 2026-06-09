export const isJwtExpired = (token: string): boolean | undefined => {
	// During testing we don't use valid JWTs, so don't try and parse them.
	if (
		"vitest" in globalThis &&
		(token === "<<funfetti-auth-jwt>>" ||
			token === "<<funfetti-auth-jwt2>>" ||
			token === "<<aus-completion-token>>")
	) {
		return false;
	}
	try {
		const decodedJwt = JSON.parse(
			Buffer.from(token.split(".")[1], "base64").toString()
		);

		const dateNow = new Date().getTime() / 1000;

		return decodedJwt.exp <= dateNow;
	} catch (e) {
		if (e instanceof Error) {
			throw new Error(`Invalid token: ${e.message}`);
		}
	}
};
