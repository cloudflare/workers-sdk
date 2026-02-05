/**
 * Stub for @cloudflare/util-sparrow analytics
 * This is a no-op implementation for portability
 */

export default {
	sendEvent: (_event: string, _data?: Record<string, unknown>) => {
		// No-op: analytics disabled in portable version
	},
	trackComponent: (_component: string) => {
		// No-op
	},
};
