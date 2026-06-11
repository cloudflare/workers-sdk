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
import { ErrorAccessDenied, ErrorNoAuthCode, ErrorOAuth2 } from "./errors";
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
	redirectUri: string;
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
		options.redirectUri,
		state,
		generators
	);
	// The path the local server must route the OAuth provider's redirect to is
	// dictated by the registered `redirectUri` — not hardcoded. Without this,
	// a consumer that registers e.g. `/my/callback` would have the provider
	// redirect the browser there but the server would silently fall through
	// with no response.
	const callbackPath = new URL(options.redirectUri).pathname;
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
				// Defensive: every code path that calls `finish()` should already
				// have written a response, but if not, end the connection so that
				// `server.close()` can complete (its callback only fires once all
				// open connections have ended). Without this, a future code path
				// that forgets to send a response could cause `wrangler login` to
				// hang until the OAuth timeout.
				if (!res.writableEnded) {
					res.end();
				}
				server.close((closeErr?: Error) => {
					if (error || closeErr) {
						reject(error || closeErr);
					} else {
						assert(token);
						resolve(token);
					}
				});
			}

			function renderErrorPage(detail: {
				code?: string;
				description?: string;
			}): void {
				const escape = (s: string) =>
					s.replace(
						/[&<>"']/g,
						(c) =>
							({
								"&": "&amp;",
								"<": "&lt;",
								">": "&gt;",
								'"': "&quot;",
								"'": "&#39;",
							})[c] as string
					);
				const codeRow = detail.code
					? `<p>Code: <code>${escape(detail.code)}</code></p>`
					: "";
				const descriptionRow = detail.description
					? `<p class="detail">${escape(detail.description)}</p>`
					: "";
				const body = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Wrangler login failed</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 720px; margin: 4rem auto; padding: 0 1rem; color: #1f2933; line-height: 1.5; }
    h1 { color: #c12d3f; }
    code { background: #f5f7fa; padding: 0.15em 0.3em; border-radius: 3px; }
    p.detail { background: #f5f7fa; padding: 1rem; border-radius: 4px; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>Wrangler login failed</h1>
  <p>The Cloudflare OAuth provider returned an error.</p>
  ${codeRow}
  ${descriptionRow}
  <p>You can close this tab and return to your terminal for more details.</p>
</body>
</html>`;
				res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
				res.end(body);
			}

			assert(req.url, "This request doesn't have a URL"); // This should never happen
			const { pathname, query } = url.parse(req.url, true);
			if (req.method !== "GET") {
				return res.end("OK");
			}
			switch (pathname) {
				case callbackPath: {
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
						}
						const oauthErr = err as ErrorOAuth2;
						renderErrorPage({
							code: oauthErr.code,
							description: oauthErr.description ?? oauthErr.message,
						});
						finish(null, oauthErr);
						return;
					}
					if (!hasAuthCode) {
						const noCodeMessage =
							"The Cloudflare OAuth provider did not return an authorisation code.";
						renderErrorPage({ description: noCodeMessage });
						finish(
							null,
							new ErrorNoAuthCode(noCodeMessage, {
								telemetryMessage: "user oauth missing auth code",
							})
						);
						return;
					}
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
							ctx.isNonInteractiveOrCI,
							options.clientId,
							options.redirectUri
						);
						res.writeHead(307, {
							Location: options.granted.url,
						});
						res.end(() => {
							finish(exchange);
						});
					} catch (err: unknown) {
						// `exchangeAuthCodeForAccessToken` can throw an `ErrorOAuth2`
						// (for provider-side errors), or a plain `Error` (for JSON
						// parse failures in `getJSONFromResponse`, network errors
						// from `fetchAuthToken`, etc.). Only read the structured
						// OAuth fields when we know we have them.
						const exchangeErr = err as Error;
						const isOAuthError = exchangeErr instanceof ErrorOAuth2;
						renderErrorPage({
							code: isOAuthError ? exchangeErr.code : undefined,
							description:
								(isOAuthError ? exchangeErr.description : undefined) ??
								exchangeErr.message ??
								"Failed to exchange the authorisation code for an access token.",
						});
						finish(null, exchangeErr);
					}
					return;
				}
			}
		});

		// Warn only when the local server listens somewhere other than where the
		// OAuth provider will redirect to (the registered `redirectUri`) — e.g.
		// a container forwarding a different host/port. When they match (the
		// common case), there is nothing to forward and no warning is needed.
		const redirect = new URL(options.redirectUri);
		const redirectPort = Number(
			redirect.port || (redirect.protocol === "https:" ? 443 : 80)
		);
		if (
			redirect.hostname !== options.callbackHost ||
			redirectPort !== options.callbackPort
		) {
			ctx.logger.log(
				`Temporary login server listening on ${options.callbackHost}:${options.callbackPort}`
			);
			ctx.logger.log(
				`Note that the OAuth login page will always redirect to \`${options.redirectUri}\`.\n` +
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
