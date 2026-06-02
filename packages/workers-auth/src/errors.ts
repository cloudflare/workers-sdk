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
 */
// To "namespace" all errors.
export class ErrorOAuth2 extends UserError {
	toString(): string {
		return "ErrorOAuth2";
	}
}

// Unclassified Oauth errors
export class ErrorUnknown extends UserError {
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
 * Translate the raw error strings returned from the server into error classes.
 */
export function toErrorClass(rawError: string): ErrorOAuth2 | ErrorUnknown {
	switch (rawError) {
		case "invalid_request":
			return new ErrorInvalidRequest(rawError, {
				telemetryMessage: "user oauth invalid request",
			});
		case "invalid_grant":
			return new ErrorInvalidGrant(rawError, {
				telemetryMessage: "user oauth invalid grant",
			});
		case "unauthorized_client":
			return new ErrorUnauthorizedClient(rawError, {
				telemetryMessage: "user oauth unauthorized client",
			});
		case "access_denied":
			return new ErrorAccessDenied(rawError, {
				telemetryMessage: "user oauth access denied",
			});
		case "unsupported_response_type":
			return new ErrorUnsupportedResponseType(rawError, {
				telemetryMessage: "user oauth unsupported response type",
			});
		case "invalid_scope":
			return new ErrorInvalidScope(rawError, {
				telemetryMessage: "user oauth invalid scope",
			});
		case "server_error":
			return new ErrorServerError(rawError, {
				telemetryMessage: "user oauth server error",
			});
		case "temporarily_unavailable":
			return new ErrorTemporarilyUnavailable(rawError, {
				telemetryMessage: "user oauth temporarily unavailable",
			});
		case "invalid_client":
			return new ErrorInvalidClient(rawError, {
				telemetryMessage: "user oauth invalid client",
			});
		case "unsupported_grant_type":
			return new ErrorUnsupportedGrantType(rawError, {
				telemetryMessage: "user oauth unsupported grant type",
			});
		case "invalid_json":
			return new ErrorInvalidJson(rawError, {
				telemetryMessage: "user oauth invalid json",
			});
		case "invalid_token":
			return new ErrorInvalidToken(rawError, {
				telemetryMessage: "user oauth invalid token",
			});
		default:
			return new ErrorUnknown(rawError, {
				telemetryMessage: "user oauth unknown error",
			});
	}
}
