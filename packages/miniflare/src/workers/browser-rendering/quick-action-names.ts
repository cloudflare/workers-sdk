// Shared by the binding Worker and the Node.js quick action runner, so this
// module must not import anything.

export const QUICK_ACTION_NAMES = [
	"screenshot",
	"content",
	"pdf",
	"scrape",
	"links",
	"accessibilityTree",
	"json",
	"markdown",
] as const;

export type QuickActionName = (typeof QUICK_ACTION_NAMES)[number];

export function isQuickActionName(name: unknown): name is QuickActionName {
	return (QUICK_ACTION_NAMES as readonly unknown[]).includes(name);
}
