import { createContext, useCallback, useContext, useState } from "react";
import type { ComponentType, PropsWithChildren } from "react";

/**
 * Stub for Modal system
 * Simplified version without Redux dependency
 */

export type ModalInjectedProps = {
	closeModal: () => void;
	isOpen?: boolean;
};

export type ModalOwnProps<Props> = Omit<Props, keyof ModalInjectedProps> & {
	onClose?: () => void;
};

interface IModal<Props extends ModalInjectedProps> {
	id: string;
	ModalComponent: ComponentType<Props>;
	props?: ModalOwnProps<Props>;
}

interface ModalContextValue {
	openModal: <Props extends ModalInjectedProps>(
		ModalComponent: ComponentType<Props>,
		props?: ModalOwnProps<Props>
	) => void;
	closeModal: <Props extends ModalInjectedProps>(
		ModalComponent?: ComponentType<Props>
	) => void;
}

const ModalContext = createContext<ModalContextValue | null>(null);

export function useModal() {
	const context = useContext(ModalContext);
	if (!context) {
		throw new Error("useModal must be used within a ModalProvider");
	}
	return context;
}

export function useModalContext() {
	const context = useContext(ModalContext);
	if (!context) {
		throw new Error("useModalContext must be used within a ModalProvider");
	}
	return context;
}

/**
 * Simple modal provider for the portable Studio component
 */
export function ModalProvider({ children }: PropsWithChildren) {
	const [modals, setModals] = useState<Array<IModal<any>>>([]);

	const openModal = useCallback(
		<Props extends ModalInjectedProps>(
			ModalComponent: ComponentType<Props>,
			props?: ModalOwnProps<Props>
		) => {
			const id = crypto.randomUUID();
			setModals((prev) => [...prev, { id, ModalComponent, props }]);
		},
		[]
	);

	const closeModal = useCallback(
		<Props extends ModalInjectedProps>(
			ModalComponent?: ComponentType<Props>
		) => {
			setModals((prev) => {
				if (ModalComponent) {
					return prev.filter((m) => m.ModalComponent !== ModalComponent);
				}
				// Close the last modal if no component specified
				return prev.slice(0, -1);
			});
		},
		[]
	);

	return (
		<ModalContext.Provider value={{ openModal, closeModal }}>
			{children}
			{modals.map(({ id, ModalComponent, props = {} }) => {
				const onClose = () => {
					if (typeof props.onClose === "function") {
						props.onClose();
					}
					closeModal(ModalComponent);
				};

				return (
					<ModalComponent
						key={id}
						{...(props as any)}
						isOpen={true}
						closeModal={onClose}
					/>
				);
			})}
		</ModalContext.Provider>
	);
}

/**
 * Action creator for opening modals (for compatibility)
 */
export function openModal<Props extends ModalInjectedProps>(
	ModalComponent: ComponentType<Props>,
	props?: ModalOwnProps<Props>
) {
	// This is a placeholder - in the original code this returns a Redux action
	// In the portable version, use the useModal hook instead
	console.warn(
		"openModal action called outside of ModalProvider context. Use useModal hook instead."
	);
	return { type: "MODAL_OPEN", payload: { ModalComponent, props } };
}

export function closeModal<Props extends ModalInjectedProps>(
	ModalComponent?: ComponentType<Props>
) {
	console.warn(
		"closeModal action called outside of ModalProvider context. Use useModal hook instead."
	);
	return { type: "MODAL_CLOSE", payload: { ModalComponent } };
}
