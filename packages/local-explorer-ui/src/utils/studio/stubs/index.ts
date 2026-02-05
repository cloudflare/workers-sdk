/**
 * Stub exports for portable Studio component
 *
 * These replace internal Cloudflare dashboard dependencies
 * with simplified implementations.
 */

// Analytics (no-op)
export { default as sparrow } from "./sparrow";

// Feature gating
export { default as useGate } from "./useGate";

// Leave guard hook
export { useLeaveGuard } from "./useLeaveGuard";

// Modal system
export {
	useModal,
	useModalContext,
	ModalProvider,
	openModal,
	closeModal,
	type ModalInjectedProps,
	type ModalOwnProps,
} from "./modal";

// Split pane
export { default as SplitPane } from "./SplitPane";

// API routes
export {
	d1Endpoints,
	doEndpoints,
	waeEndpoints,
	endpoints,
	routes,
} from "./routes";

// UI Components
export { DeleteConfirmationModal } from "./ui/DeleteConfirmationModal";
export { ConfirmationModal, type ModalHandlers } from "./ui/ConfirmationModal";
export { Drawer, FooterActions } from "./ui/Drawer";
export { SkeletonBlock, LoadingWorkersSkeleton } from "./ui/SkeletonBlock";
export { Modal } from "./ui/Modal";
