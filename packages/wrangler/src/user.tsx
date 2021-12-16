/* Based heavily on code from https://github.com/BitySA/oauth2-auth-code-pkce */

/* 

                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright [yyyy] [name of copyright owner]

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
  */

import React from "react";
import { render } from "ink";
import Table from "ink-table";
import SelectInput from "ink-select-input";
import fetch from "node-fetch";
import { webcrypto as crypto } from "node:crypto";
import { TextEncoder } from "node:util";
import open from "open";
import url from "node:url";
import http from "node:http";
import { readFile, writeFile, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import os from "node:os";
import TOML from "@iarna/toml";
import assert from "node:assert";
import type { ParsedUrlQuery } from "node:querystring";
import { CF_API_BASE_URL } from "./cfetch";
import type { Response } from "node-fetch";

/**
 * An implementation of rfc6749#section-4.1 and rfc7636.
 */

interface PKCECodes {
  codeChallenge: string;
  codeVerifier: string;
}

interface State {
  accessToken?: AccessToken; // persist
  authorizationCode?: string;
  codeChallenge?: string;
  codeVerifier?: string;
  hasAuthCodeBeenExchangedForAccessToken?: boolean;
  refreshToken?: RefreshToken; // persist
  stateQueryParam?: string;
  scopes?: Scope[];
}

interface RefreshToken {
  value: string;
}

interface AccessToken {
  value: string;
  expiry: string;
}

type Scope =
  | "account:read"
  | "user:read"
  | "workers:write"
  | "workers_kv:write"
  | "workers_routes:write"
  | "workers_scripts:write"
  | "workers_tail:read"
  | "zone:read"
  | "offline_access"; // this should be included by default

const Scopes: Scope[] = [
  "account:read",
  "user:read",
  "workers:write",
  "workers_kv:write",
  "workers_routes:write",
  "workers_scripts:write",
  "workers_tail:read",
  "zone:read",
];

const ScopeDescriptions = [
  "See your account info such as account details, analytics, and memberships.",
  "See your user info such as name, email address, and account memberships.",
  "See and change Cloudflare Workers data such as zones, KV storage, namespaces, scripts, and routes.",
  "See and change Cloudflare Workers KV Storage data such as keys and namespaces.",
  "See and change Cloudflare Workers data such as filters and routes.",
  "See and change Cloudflare Workers scripts, durable objects, subdomains, triggers, and tail data.",
  "See Cloudflare Workers tail and script data.",
  "Grants read level access to account zone.",
];

const CLIENT_ID = "54d11594-84e4-41aa-b438-e81b8fa78ee7";
const AUTH_URL = "https://dash.cloudflare.com/oauth2/auth";
const TOKEN_URL = "https://dash.cloudflare.com/oauth2/token";
const CALLBACK_URL = "http://localhost:8976/oauth/callback";
const REVOKE_URL = "https://dash.cloudflare.com/oauth2/revoke";

const LocalState: State = {};
let initialised = false;

// we do this because we have some async stuff
// TODO: this should just happen in the top level
// abd we should fiure out how to do top level await
export async function initialise(): Promise<void> {
  // get refreshtoken/accesstoken from fs if exists
  try {
    // if CF_API_TOKEN available, use that
    if (process.env.CF_API_TOKEN) {
      LocalState.accessToken = {
        value: process.env.CF_API_TOKEN,
        expiry: "3021-12-31T23:59:59+00:00",
      };
      initialised = true;
      return;
    }

    const toml = TOML.parse(
      await readFile(path.join(os.homedir(), ".wrangler/config/default.toml"), {
        encoding: "utf-8",
      })
    );
    const { oauth_token, refresh_token, expiration_time } = toml as {
      oauth_token: string;
      refresh_token: string;
      expiration_time: string;
    };
    if (oauth_token) {
      LocalState.accessToken = { value: oauth_token, expiry: expiration_time };
    }
    if (refresh_token) {
      LocalState.refreshToken = { value: refresh_token };
    }
  } catch (err) {
    // no config yet, let's chill
    // console.error(err);
  }
  initialised = true;
}

// ugh. TODO: see fix from above.
function throwIfNotInitialised() {
  if (initialised === false) {
    throw new Error(
      "did you forget to call initialise() from the user module?"
    );
  }
}

export function getAPIToken(): string {
  if (process.env.CF_API_TOKEN) {
    return process.env.CF_API_TOKEN;
  }

  throwIfNotInitialised();
  return LocalState.accessToken?.value;
}

interface AccessContext {
  token?: AccessToken;
  scopes?: Scope[];
  refreshToken?: RefreshToken;
}

/**
 * A list of OAuth2AuthCodePKCE errors.
 */
// To "namespace" all errors.
class ErrorOAuth2 extends Error {
  toString(): string {
    return "ErrorOAuth2";
  }
}

// For really unknown errors.
class ErrorUnknown extends ErrorOAuth2 {
  toString(): string {
    return "ErrorUnknown";
  }
}

// Some generic, internal errors that can happen.
class ErrorNoAuthCode extends ErrorOAuth2 {
  toString(): string {
    return "ErrorNoAuthCode";
  }
}
class ErrorInvalidReturnedStateParam extends ErrorOAuth2 {
  toString(): string {
    return "ErrorInvalidReturnedStateParam";
  }
}
class ErrorInvalidJson extends ErrorOAuth2 {
  toString(): string {
    return "ErrorInvalidJson";
  }
}

// Errors that occur across many endpoints
class ErrorInvalidScope extends ErrorOAuth2 {
  toString(): string {
    return "ErrorInvalidScope";
  }
}
class ErrorInvalidRequest extends ErrorOAuth2 {
  toString(): string {
    return "ErrorInvalidRequest";
  }
}
class ErrorInvalidToken extends ErrorOAuth2 {
  toString(): string {
    return "ErrorInvalidToken";
  }
}

/**
 * Possible authorization grant errors given by the redirection from the
 * authorization server.
 */
class ErrorAuthenticationGrant extends ErrorOAuth2 {
  toString(): string {
    return "ErrorAuthenticationGrant";
  }
}
class ErrorUnauthorizedClient extends ErrorAuthenticationGrant {
  toString(): string {
    return "ErrorUnauthorizedClient";
  }
}
class ErrorAccessDenied extends ErrorAuthenticationGrant {
  toString(): string {
    return "ErrorAccessDenied";
  }
}
class ErrorUnsupportedResponseType extends ErrorAuthenticationGrant {
  toString(): string {
    return "ErrorUnsupportedResponseType";
  }
}
class ErrorServerError extends ErrorAuthenticationGrant {
  toString(): string {
    return "ErrorServerError";
  }
}
class ErrorTemporarilyUnavailable extends ErrorAuthenticationGrant {
  toString(): string {
    return "ErrorTemporarilyUnavailable";
  }
}

/**
 * A list of possible access token response errors.
 */
class ErrorAccessTokenResponse extends ErrorOAuth2 {
  toString(): string {
    return "ErrorAccessTokenResponse";
  }
}
class ErrorInvalidClient extends ErrorAccessTokenResponse {
  toString(): string {
    return "ErrorInvalidClient";
  }
}
class ErrorInvalidGrant extends ErrorAccessTokenResponse {
  toString(): string {
    return "ErrorInvalidGrant";
  }
}
class ErrorUnsupportedGrantType extends ErrorAccessTokenResponse {
  toString(): string {
    return "ErrorUnsupportedGrantType";
  }
}

const RawErrorToErrorClassMap: { [_: string]: typeof ErrorOAuth2 } = {
  invalid_request: ErrorInvalidRequest,
  invalid_grant: ErrorInvalidGrant,
  unauthorized_client: ErrorUnauthorizedClient,
  access_denied: ErrorAccessDenied,
  unsupported_response_type: ErrorUnsupportedResponseType,
  invalid_scope: ErrorInvalidScope,
  server_error: ErrorServerError,
  temporarily_unavailable: ErrorTemporarilyUnavailable,
  invalid_client: ErrorInvalidClient,
  unsupported_grant_type: ErrorUnsupportedGrantType,
  invalid_json: ErrorInvalidJson,
  invalid_token: ErrorInvalidToken,
};

/**
 * Translate the raw error strings returned from the server into error classes.
 */
function toErrorClass(rawError: string): ErrorOAuth2 {
  return new (RawErrorToErrorClassMap[rawError] || ErrorUnknown)();
}

/**
 * The maximum length for a code verifier for the best security we can offer.
 * Please note the NOTE section of RFC 7636 § 4.1 - the length must be >= 43,
 * but <= 128, **after** base64 url encoding. This means 32 code verifier bytes
 * encoded will be 43 bytes, or 96 bytes encoded will be 128 bytes. So 96 bytes
 * is the highest valid value that can be used.
 */
const RECOMMENDED_CODE_VERIFIER_LENGTH = 96;

/**
 * A sensible length for the state's length, for anti-csrf.
 */
const RECOMMENDED_STATE_LENGTH = 32;

/**
 * Character set to generate code verifier defined in rfc7636.
 */
const PKCE_CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

/**
 * OAuth 2.0 client that ONLY supports authorization code flow, with PKCE.
 */

/**
 * If there is an error, it will be passed back as a rejected Promise.
 * If there is no code, the user should be redirected via
 * [fetchAuthorizationCode].
 */
function isReturningFromAuthServer(query: ParsedUrlQuery): boolean {
  if (query.error) {
    if (Array.isArray(query.error)) {
      throw toErrorClass(query.error[0]);
    }
    throw toErrorClass(query.error);
  }

  const code = query.code;
  if (!code) {
    return false;
  }

  const state = LocalState;

  const stateQueryParam = query.state;
  if (stateQueryParam !== state.stateQueryParam) {
    console.warn(
      "state query string parameter doesn't match the one sent! Possible malicious activity somewhere."
    );
    throw new ErrorInvalidReturnedStateParam();
  }
  assert(!Array.isArray(code));
  state.authorizationCode = code;
  state.hasAuthCodeBeenExchangedForAccessToken = false;
  return true;
}

export async function getAuthURL(scopes?: string[]): Promise<string> {
  const { codeChallenge, codeVerifier } = await generatePKCECodes();
  const stateQueryParam = generateRandomState(RECOMMENDED_STATE_LENGTH);

  Object.assign(LocalState, {
    codeChallenge,
    codeVerifier,
    stateQueryParam,
  });

  // TODO: verify that the scopes passed are legit

  return (
    AUTH_URL +
    `?response_type=code&` +
    `client_id=${encodeURIComponent(CLIENT_ID)}&` +
    `redirect_uri=${encodeURIComponent(CALLBACK_URL)}&` +
    `scope=${encodeURIComponent(
      (scopes || Scopes).concat("offline_access").join(" ")
    )}&` +
    `state=${stateQueryParam}&` +
    `code_challenge=${encodeURIComponent(codeChallenge)}&` +
    `code_challenge_method=S256`
  );
}

/**
 * Refresh an access token from the remote service.
 */
async function exchangeRefreshTokenForAccessToken(): Promise<AccessContext> {
  const { refreshToken } = LocalState;

  if (!refreshToken) {
    console.warn("No refresh token is present.");
  }

  const url = TOKEN_URL;
  const body =
    `grant_type=refresh_token&` +
    `refresh_token=${refreshToken?.value}&` +
    `client_id=${CLIENT_ID}`;

  const response = await fetch(url, {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  if (response.status >= 400) {
    throw await response.json();
  } else {
    try {
      const json = await response.json();
      const { access_token, expires_in, refresh_token, scope } = json as {
        access_token: string;
        expires_in: number;
        refresh_token: string;
        scope: string;
      };
      let scopes: Scope[] = [];

      const accessToken: AccessToken = {
        value: access_token,
        expiry: new Date(Date.now() + expires_in * 1000).toISOString(),
      };
      LocalState.accessToken = accessToken;

      if (refresh_token) {
        const refreshToken: RefreshToken = {
          value: refresh_token,
        };
        LocalState.refreshToken = refreshToken;
      }

      if (scope) {
        // Multiple scopes are passed and delimited by spaces,
        // despite using the singular name "scope".
        scopes = scope.split(" ") as Scope[];
        LocalState.scopes = scopes;
      }

      const accessContext: AccessContext = {
        token: accessToken,
        scopes,
        refreshToken: LocalState.refreshToken,
      };
      return accessContext;
    } catch (err) {
      const error = err?.error || "There was a network error.";
      switch (error) {
        case "invalid_grant":
          console.log(
            "Expired! Auth code or refresh token needs to be renewed."
          );
          // alert("Redirecting to auth server to obtain a new auth grant code.");
          // TODO: return refreshAuthCodeOrRefreshToken();
          break;
        default:
          break;
      }
      throw toErrorClass(error);
    }
  }
}

/**
 * Fetch an access token from the remote service.
 */
async function exchangeAuthCodeForAccessToken(): Promise<AccessContext> {
  const { authorizationCode, codeVerifier = "" } = LocalState;

  if (!codeVerifier) {
    console.warn("No code verifier is being sent.");
  } else if (!authorizationCode) {
    console.warn("No authorization grant code is being passed.");
  }

  const url = TOKEN_URL;
  const body =
    `grant_type=authorization_code&` +
    `code=${encodeURIComponent(authorizationCode || "")}&` +
    `redirect_uri=${encodeURIComponent(CALLBACK_URL)}&` +
    `client_id=${encodeURIComponent(CLIENT_ID)}&` +
    `code_verifier=${codeVerifier}`;

  const response = await fetch(url, {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  if (!response.ok) {
    const { error } = (await response.json()) as { error: string };
    // .catch((_) => ({ error: "invalid_json" }));
    if (error === "invalid_grant") {
      console.log("Expired! Auth code or refresh token needs to be renewed.");
      // alert("Redirecting to auth server to obtain a new auth grant code.");
      // TODO: return refreshAuthCodeOrRefreshToken();
    }
    throw toErrorClass(error);
  }
  const json = await response.json();
  const { access_token, expires_in, refresh_token, scope } = json as {
    access_token: string;
    expires_in: number;
    refresh_token: string;
    scope: string;
  };
  let scopes: Scope[] = [];
  LocalState.hasAuthCodeBeenExchangedForAccessToken = true;

  const expiryDate = new Date(Date.now() + expires_in * 1000);
  const accessToken: AccessToken = {
    value: access_token,
    expiry: expiryDate.toISOString(),
  };
  LocalState.accessToken = accessToken;

  if (refresh_token) {
    const refreshToken: RefreshToken = {
      value: refresh_token,
    };
    LocalState.refreshToken = refreshToken;
  }

  if (scope) {
    // Multiple scopes are passed and delimited by spaces,
    // despite using the singular name "scope".
    scopes = scope.split(" ") as Scope[];
    LocalState.scopes = scopes;
  }

  const accessContext: AccessContext = {
    token: accessToken,
    scopes,
    refreshToken: LocalState.refreshToken,
  };
  return accessContext;
}

/**
 * Implements *base64url-encode* (RFC 4648 § 5) without padding, which is NOT
 * the same as regular base64 encoding.
 */
function base64urlEncode(value: string): string {
  let base64 = btoa(value);
  base64 = base64.replace(/\+/g, "-");
  base64 = base64.replace(/\//g, "_");
  base64 = base64.replace(/=/g, "");
  return base64;
}

/**
 * Generates a code_verifier and code_challenge, as specified in rfc7636.
 */

async function generatePKCECodes(): Promise<PKCECodes> {
  const output = new Uint32Array(RECOMMENDED_CODE_VERIFIER_LENGTH);
  // @ts-expect-error crypto's types aren't there yet
  crypto.getRandomValues(output);
  const codeVerifier = base64urlEncode(
    Array.from(output)
      .map((num: number) => PKCE_CHARSET[num % PKCE_CHARSET.length])
      .join("")
  );
  // @ts-expect-error crypto's types aren't there yet
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier)
  );
  const hash = new Uint8Array(buffer);
  let binary = "";
  const hashLength = hash.byteLength;
  for (let i = 0; i < hashLength; i++) {
    binary += String.fromCharCode(hash[i]);
  }
  const codeChallenge = base64urlEncode(binary);
  return { codeChallenge, codeVerifier };
}

/**
 * Generates random state to be passed for anti-csrf.
 */
function generateRandomState(lengthOfState: number): string {
  const output = new Uint32Array(lengthOfState);
  // @ts-expect-error crypto's types aren't there yet
  crypto.getRandomValues(output);
  return Array.from(output)
    .map((num: number) => PKCE_CHARSET[num % PKCE_CHARSET.length])
    .join("");
}

async function writeToConfigFile(tokenData: AccessContext) {
  await mkdir(path.join(os.homedir(), ".wrangler/config/"), {
    recursive: true,
  });
  await writeFile(
    path.join(os.homedir(), ".wrangler/config/default.toml"),
    `
oauth_token = "${tokenData.token?.value || ""}"
refresh_token = "${tokenData.refreshToken?.value}"
expiration_time = "${tokenData.token?.expiry}"
`,
    { encoding: "utf-8" }
  );
}

type LoginProps = {
  scopes?: string[];
};

export async function loginOrRefreshIfRequired(): Promise<boolean> {
  // TODO: if there already is a token, then try refreshing
  // TODO: ask permission before opening browser
  if (!LocalState.accessToken) {
    // not logged in.
    return await login();
  } else if (isAccessTokenExpired()) {
    return await refreshToken();
  } else {
    return true;
  }
}

export async function login(props?: LoginProps): Promise<boolean> {
  const urlToOpen = await getAuthURL(props?.scopes);
  await open(urlToOpen);
  // TODO: log url only if on system where it's unreliable/unavailable
  // console.log(`💁 Opened ${urlToOpen}`);
  let server;
  let loginTimeoutHandle;
  const timerPromise = new Promise<boolean>((resolve) => {
    loginTimeoutHandle = setTimeout(() => {
      console.error("Timed out waiting for authorization code.");
      server.close();
      clearTimeout(loginTimeoutHandle);
      resolve(false);
    }, 60000); // wait for 30 seconds for the user to authorize
  });

  const loginPromise = new Promise<boolean>((resolve, reject) => {
    server = http.createServer(async (req, res) => {
      function finish(status: boolean, error?: Error) {
        clearTimeout(loginTimeoutHandle);
        server.close((closeErr?: Error) => {
          if (error || closeErr) {
            reject(error || closeErr);
          } else resolve(status);
        });
      }

      assert(req.url, "This request doesn't have a URL"); // This should never happen
      const { pathname, query } = url.parse(req.url, true);
      switch (pathname) {
        case "/oauth/callback": {
          let hasAuthCode = false;
          try {
            hasAuthCode = isReturningFromAuthServer(query);
          } catch (err: unknown) {
            if (err instanceof ErrorAccessDenied) {
              res.writeHead(307, {
                Location:
                  "https://welcome.developers.workers.dev/wrangler-oauth-consent-denied",
              });
              res.end(() => {
                finish(false);
              });
              console.log(
                "Error: Consent denied. You must grant consent to Wrangler in order to login. If you don't want to do this consider passing an API token with CF_API_TOKEN variable"
              ); // TODO: implement wrangler config lol

              return;
            } else {
              finish(false, err as Error);
              return;
            }
          }
          if (!hasAuthCode) {
            // render an error page here
            finish(false, new ErrorNoAuthCode());
            return;
          } else {
            const tokenData = await exchangeAuthCodeForAccessToken();
            await writeToConfigFile(tokenData);
            res.writeHead(307, {
              Location:
                "https://welcome.developers.workers.dev/wrangler-oauth-consent-granted",
            });
            res.end(() => {
              finish(true);
            });
            console.log(
              `Successfully configured. You can find your configuration file at: ${os.homedir()}/.wrangler/config/default.toml`
            );

            return;
          }
        }
      }
    });

    server.listen(8976);
  });

  return Promise.race([timerPromise, loginPromise]);
}

/**
 * Checks to see if the access token has expired.
 */
export function isAccessTokenExpired(): boolean {
  throwIfNotInitialised();
  const { accessToken } = LocalState;
  return Boolean(accessToken && new Date() >= new Date(accessToken.expiry));
}

export async function refreshToken(): Promise<boolean> {
  throwIfNotInitialised();
  // refresh
  try {
    const refreshed = await exchangeRefreshTokenForAccessToken();
    await writeToConfigFile(refreshed);
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

export async function logout(): Promise<void> {
  throwIfNotInitialised();
  const { refreshToken } = LocalState;
  if (!refreshToken) {
    console.log("Not logged in, exiting...");
    return;
  }
  const body =
    `client_id=${encodeURIComponent(CLIENT_ID)}&` +
    `token_type_hint=refresh_token&` +
    `token=${encodeURIComponent(refreshToken?.value || "")}`;

  const response = await fetch(REVOKE_URL, {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  await response.text(); // blank text? would be nice if it was something meaningful
  console.log(
    "💁  Wrangler is configured with an OAuth token. The token has been successfully revoked"
  );
  // delete the file
  await rm(path.join(os.homedir(), ".wrangler/config/default.toml"));
  console.log(
    `Removing ${os.homedir()}/.wrangler/config/default.toml.. success!`
  );
}

export function listScopes(): void {
  throwIfNotInitialised();
  console.log("💁 Available scopes:");
  const data = Scopes.map((scope, index) => ({
    Scope: scope,
    Description: ScopeDescriptions[index],
  }));
  render(<Table data={data} />);
  // TODO: maybe a good idea to show usage here
}

export async function getAccountId() {
  const apiToken = getAPIToken();
  if (!apiToken) return;

  if (process.env.CF_ACCOUNT_ID) {
    return process.env.CF_ACCOUNT_ID;
  }

  let response: Response;
  try {
    response = await fetch(`${CF_API_BASE_URL}/memberships`, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + apiToken,
      },
    });
  } catch (err) {
    // probably offline
  }
  if (!response) return;
  let accountId: string;
  // @ts-expect-error need to type this response
  const responseJSON: {
    success: boolean;
    result: { id: string; account: { id: string; name: string } }[];
  } = await response.json();

  if (responseJSON.success === true) {
    if (responseJSON.result.length === 1) {
      accountId = responseJSON.result[0].account.id;
    } else {
      accountId = await new Promise((resolve) => {
        const accounts = responseJSON.result.map((x) => x.account);
        const { unmount } = render(
          <ChooseAccount
            accounts={accounts}
            onSelect={async (selected) => {
              resolve(selected.value.id);
              unmount();
            }}
          />
        );
      });
    }
  }
  return accountId;
}

type ChooseAccountItem = {
  id: string;
  name: string;
};
export function ChooseAccount(props: {
  accounts: ChooseAccountItem[];
  onSelect: (item) => void;
}) {
  return (
    <SelectInput
      items={props.accounts.map((item) => ({
        key: item.id,
        label: item.name,
        value: item,
      }))}
      onSelect={props.onSelect}
    />
  );
}
