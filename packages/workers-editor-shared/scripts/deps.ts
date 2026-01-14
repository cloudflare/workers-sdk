/**
 * Dependencies that _are not_ bundled along with @cloudflare/workers-editor-shared.
 *
 * These must be explicitly documented with a reason why they cannot be bundled.
 * This list is validated by `tools/deployments/validate-package-dependencies.ts`.
 */
export const EXTERNAL_DEPENDENCIES = [
	// React split pane component - kept external as it's a React component
	// that needs to integrate with the host application's React instance
	"react-split-pane",
];
