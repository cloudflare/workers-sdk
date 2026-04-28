/**
 * Response from:
 *
 * GET /accounts/{account_id}/browser-rendering/devtools/session
 */
export interface BrowserSession {
	sessionId: string;
	startTime: number;
	connectionId?: string;
	connectionStartTime?: number;
}

/**
 * Response from:
 *
 * GET /accounts/{account_id}/browser-rendering/devtools/browser/{session_id}/json
 */
export interface BrowserTarget {
	id: string;
	type: string;
	title?: string;
	url?: string;
	description?: string;
	devtoolsFrontendUrl?: string;
	webSocketDebuggerUrl?: string;
}

/**
 * Response from:
 *
 * POST /accounts/{account_id}/browser-rendering/devtools/browser?targets=true
 */
export interface BrowserAcquireResponse {
	sessionId: string;
	targets: BrowserTarget[];
}

/**
 * Response from:
 *
 * DELETE /accounts/{account_id}/browser-rendering/devtools/browser/{session_id}
 */
export interface BrowserCloseResponse {
	status: "closing" | "closed";
}
