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
import { UserError } from "@cloudflare/workers-utils";

/**
 * A list of OAuth2AuthCodePKCE errors.
 *
 * Instances may carry the structured details from the OAuth provider's
 * `error`, `error_description` and `error_uri` query parameters (RFC 6749
 * §4.1.2.1) so callers can render them — see {@link toErrorClass}.
 */
// To "namespace" all errors.
export class ErrorOAuth2 extends UserError {
	/** The OAuth `error` code returned by the provider (e.g. `invalid_scope`). */
	code?: string;
	/** The OAuth `error_description` returned by the provider, if any. */
	description?: string;
	/** The OAuth `error_uri` returned by the provider, if any. */
	uri?: string;
	toString(): string {
		return "ErrorOAuth2";
	}
}

// Unclassified Oauth errors
export class ErrorUnknown extends ErrorOAuth2 {
	toString(): string {
		return "ErrorUnknown";
	}
}

// Some generic, internal errors that can happen.
export class ErrorNoAuthCode extends ErrorOAuth2 {
	toString(): string {
		return "ErrorNoAuthCode";
	}
}
export class ErrorInvalidReturnedStateParam extends ErrorOAuth2 {
	toString(): string {
		return "ErrorInvalidReturnedStateParam";
	}
}
export class ErrorInvalidJson extends ErrorOAuth2 {
	toString(): string {
		return "ErrorInvalidJson";
	}
}

// Errors that occur across many endpoints
export class ErrorInvalidScope extends ErrorOAuth2 {
	toString(): string {
		return "ErrorInvalidScope";
	}
}
export class ErrorInvalidRequest extends ErrorOAuth2 {
	toString(): string {
		return "ErrorInvalidRequest";
	}
}
export class ErrorInvalidToken extends ErrorOAuth2 {
	toString(): string {
		return "ErrorInvalidToken";
	}
}

/**
 * Possible authorization grant errors given by the redirection from the
 * authorization server.
 */
export class ErrorAuthenticationGrant extends ErrorOAuth2 {
	toString(): string {
		return "ErrorAuthenticationGrant";
	}
}
export class ErrorUnauthorizedClient extends ErrorAuthenticationGrant {
	toString(): string {
		return "ErrorUnauthorizedClient";
	}
}
export class ErrorAccessDenied extends ErrorAuthenticationGrant {
	toString(): string {
		return "ErrorAccessDenied";
	}
}
export class ErrorUnsupportedResponseType extends ErrorAuthenticationGrant {
	toString(): string {
		return "ErrorUnsupportedResponseType";
	}
}
export class ErrorServerError extends ErrorAuthenticationGrant {
	toString(): string {
		return "ErrorServerError";
	}
}
export class ErrorTemporarilyUnavailable extends ErrorAuthenticationGrant {
	toString(): string {
		return "ErrorTemporarilyUnavailable";
	}
}

/**
 * A list of possible access token response errors.
 */
export class ErrorAccessTokenResponse extends ErrorOAuth2 {
	toString(): string {
		return "ErrorAccessTokenResponse";
	}
}
export class ErrorInvalidClient extends ErrorAccessTokenResponse {
	toString(): string {
		return "ErrorInvalidClient";
	}
}
export class ErrorInvalidGrant extends ErrorAccessTokenResponse {
	toString(): string {
		return "ErrorInvalidGrant";
	}
}
export class ErrorUnsupportedGrantType extends ErrorAccessTokenResponse {
	toString(): string {
		return "ErrorUnsupportedGrantType";
	}
}

/**
 * Format the parts of an OAuth provider error response into a single,
 * user-facing message.
 */
function formatOAuthErrorMessage(
	code: string,
	description: string | undefined,
	uri: string | undefined
): string {
	let message = `OAuth error: ${code}`;
	if (description) {
		message += `\n  ${description}`;
	}
	if (uri) {
		message += `\n  See: ${uri}`;
	}
	return message;
}

/**
 * Translate an OAuth error response from the provider into one of our error
 * classes. The `error_description` and `error_uri` parameters (RFC 6749
 * §4.1.2.1) are included in the message when present so the user sees the
 * specific reason for the failure rather than just the bare error code, and
 * are also attached as structured fields so the HTTP callback handler can
 * render them on the browser-facing error page.
 */
export function toErrorClass(
	rawError: string,
	description?: string,
	uri?: string
): ErrorOAuth2 | ErrorUnknown {
	const message = formatOAuthErrorMessage(rawError, description, uri);
	let error: ErrorOAuth2 | ErrorUnknown;
	switch (rawError) {
		case "invalid_request":
			error = new ErrorInvalidRequest(message, {
				telemetryMessage: "user oauth invalid request",
			});
			break;
		case "invalid_grant":
			error = new ErrorInvalidGrant(message, {
				telemetryMessage: "user oauth invalid grant",
			});
			break;
		case "unauthorized_client":
			error = new ErrorUnauthorizedClient(message, {
				telemetryMessage: "user oauth unauthorized client",
			});
			break;
		case "access_denied":
			error = new ErrorAccessDenied(message, {
				telemetryMessage: "user oauth access denied",
			});
			break;
		case "unsupported_response_type":
			error = new ErrorUnsupportedResponseType(message, {
				telemetryMessage: "user oauth unsupported response type",
			});
			break;
		case "invalid_scope":
			error = new ErrorInvalidScope(message, {
				telemetryMessage: "user oauth invalid scope",
			});
			break;
		case "server_error":
			error = new ErrorServerError(message, {
				telemetryMessage: "user oauth server error",
			});
			break;
		case "temporarily_unavailable":
			error = new ErrorTemporarilyUnavailable(message, {
				telemetryMessage: "user oauth temporarily unavailable",
			});
			break;
		case "invalid_client":
			error = new ErrorInvalidClient(message, {
				telemetryMessage: "user oauth invalid client",
			});
			break;
		case "unsupported_grant_type":
			error = new ErrorUnsupportedGrantType(message, {
				telemetryMessage: "user oauth unsupported grant type",
			});
			break;
		case "invalid_json":
			error = new ErrorInvalidJson(message, {
				telemetryMessage: "user oauth invalid json",
			});
			break;
		case "invalid_token":
			error = new ErrorInvalidToken(message, {
				telemetryMessage: "user oauth invalid token",
			});
			break;
		default:
			error = new ErrorUnknown(message, {
				telemetryMessage: "user oauth unknown error",
			});
			break;
	}
	error.code = rawError;
	error.description = description;
	error.uri = uri;
	return error;
}
