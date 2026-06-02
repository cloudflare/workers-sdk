/* Based heavily on code from https://github.com/BitySA/oauth2-auth-code-pkce
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import assert from "node:assert";
import http from "node:http";
import url from "node:url";
import { UserError } from "@cloudflare/workers-utils";
import { ErrorAccessDenied, ErrorNoAuthCode } from "./errors";
import {
	exchangeAuthCodeForAccessToken,
	getAuthURL,
	isReturningFromAuthServer,
	type AccessContext,
} from "./token-exchange";
import type { OAuthFlowContext } from "./context";
import type { generateAuthUrl as defaultGenerateAuthUrl } from "./generate-auth-url";
import type { generateRandomState as defaultGenerateRandomState } from "./generate-random-state";
import type { OAuthFlowState } from "./state";

export interface GetOauthTokenOptions {
	browser: boolean;
	scopes: string[];
	clientId: string;
	denied: {
		url: string;
		error: string;
	};
	granted: {
		url: string;
	};
	callbackHost: string;
	callbackPort: number;
}

/**
 * Orchestrate the interactive OAuth login: spin up a local HTTP callback
 * server, open the authorize URL in the user's browser, and wait for the
 * server to redeem the auth code for an access token. Times out after 2
 * minutes.
 */
export async function getOauthToken(
	options: GetOauthTokenOptions,
	state: OAuthFlowState,
	ctx: OAuthFlowContext,
	generators: {
		generateAuthUrl: typeof defaultGenerateAuthUrl;
		generateRandomState: typeof defaultGenerateRandomState;
	}
): Promise<AccessContext> {
	const urlToOpen = await getAuthURL(
		options.scopes,
		options.clientId,
		state,
		generators
	);
	let server: http.Server;
	let loginTimeoutHandle: ReturnType<typeof setTimeout>;
	const timerPromise = new Promise<AccessContext>((_, reject) => {
		loginTimeoutHandle = setTimeout(() => {
			server.close();
			clearTimeout(loginTimeoutHandle);
			reject(
				new UserError(
					"Timed out waiting for authorization code, please try again.",
					{ telemetryMessage: "user oauth authorization timeout" }
				)
			);
		}, 120000); // wait for 120 seconds for the user to authorize
	});

	const loginPromise = new Promise<AccessContext>((resolve, reject) => {
		server = http.createServer(async (req, res) => {
			function finish(token: null, error: Error): void;
			function finish(token: AccessContext): void;
			function finish(token: AccessContext | null, error?: Error) {
				clearTimeout(loginTimeoutHandle);
				server.close((closeErr?: Error) => {
					if (error || closeErr) {
						reject(error || closeErr);
					} else {
						assert(token);
						resolve(token);
					}
				});
			}

			assert(req.url, "This request doesn't have a URL"); // This should never happen
			const { pathname, query } = url.parse(req.url, true);
			if (req.method !== "GET") {
				return res.end("OK");
			}
			switch (pathname) {
				case "/oauth/callback": {
					let hasAuthCode = false;
					try {
						hasAuthCode = isReturningFromAuthServer(query, state, ctx.logger);
					} catch (err: unknown) {
						if (err instanceof ErrorAccessDenied) {
							res.writeHead(307, {
								Location: options.denied.url,
							});
							res.end(() => {
								finish(
									null,
									new UserError(options.denied.error, {
										telemetryMessage: "user oauth consent denied",
									})
								);
							});

							return;
						} else {
							finish(null, err as Error);
							return;
						}
					}
					if (!hasAuthCode) {
						// render an error page here
						finish(
							null,
							new ErrorNoAuthCode("", {
								telemetryMessage: "user oauth missing auth code",
							})
						);
						return;
					} else {
						// `exchangeAuthCodeForAccessToken` can reject (network error,
						// invalid JSON, OAuth error response, etc.). Without this
						// `try/catch` the rejection would become an unhandled promise
						// rejection inside an `http.createServer` callback, which is
						// not promise-aware — Node.js >= 15 terminates the process on
						// unhandled rejection by default. Route the error through
						// `finish` so the caller's promise rejects cleanly.
						try {
							const exchange = await exchangeAuthCodeForAccessToken(
								state,
								ctx.logger,
								ctx.isNonInteractiveOrCI
							);
							res.writeHead(307, {
								Location: options.granted.url,
							});
							res.end(() => {
								finish(exchange);
							});
						} catch (err) {
							finish(null, err as Error);
						}
						return;
					}
				}
			}
		});

		if (options.callbackHost !== "localhost" || options.callbackPort !== 8976) {
			ctx.logger.log(
				`Temporary login server listening on ${options.callbackHost}:${options.callbackPort}`
			);
			ctx.logger.log(
				"Note that the OAuth login page will always redirect to `localhost:8976`.\n" +
					"If you have changed the callback host or port because you are running in a container, then ensure that you have port forwarding set up correctly."
			);
		}
		// Surface a clear error when the port is already in use (or any other
		// `server.listen` failure) rather than crashing with an unhelpful
		// stack trace from an unhandled 'error' event.
		server.once("error", (err: NodeJS.ErrnoException) => {
			clearTimeout(loginTimeoutHandle);
			if (err.code === "EADDRINUSE") {
				reject(
					new UserError(
						`The OAuth callback server could not bind to ${options.callbackHost}:${options.callbackPort} because the port is already in use. Stop the process using that port or pass a different \`--callback-port\`.`,
						{ telemetryMessage: "user oauth callback port in use" }
					)
				);
			} else {
				reject(err);
			}
		});
		server.listen(options.callbackPort, options.callbackHost);
	});
	if (options.browser) {
		ctx.logger.log(`Opening a link in your default browser: ${urlToOpen}`);
		await ctx.openInBrowser(urlToOpen);
	} else {
		ctx.logger.log(`Visit this link to authenticate: ${urlToOpen}`);
	}

	return Promise.race([timerPromise, loginPromise]);
}
