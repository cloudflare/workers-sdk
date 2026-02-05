/**
 * Stub for feature gating hook
 * Returns false by default - override this to enable specific features
 */

export default function useGate(_gateName: string): boolean {
	// All gates are disabled by default in portable version
	// You can customize this to enable specific features
	return false;
}
