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

/**
 * Internal type-erased modal entry for heterogeneous storage.
 * The public API remains fully generic via `openModal<Props>(...)`.
 */
interface IModalEntry {
	id: string;
	ModalComponent: ComponentType<ModalInjectedProps>;
	props?: Record<string, unknown>;
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
	const [modals, setModals] = useState<Array<IModalEntry>>([]);

	const handleOpenModal = useCallback(
		<Props extends ModalInjectedProps>(
			ModalComponent: ComponentType<Props>,
			props?: ModalOwnProps<Props>
		) => {
			const id = crypto.randomUUID();
			setModals((prev) => [
				...prev,
				{
					id,
					ModalComponent:
						ModalComponent as unknown as ComponentType<ModalInjectedProps>,
					props: props as unknown as Record<string, unknown>,
				},
			]);
		},
		[]
	);

	const handleCloseModal = useCallback(
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
		<ModalContext.Provider
			value={{ openModal: handleOpenModal, closeModal: handleCloseModal }}
		>
			{children}
			{modals.map(({ id, ModalComponent, props = {} }) => {
				const onClose = () => {
					const onCloseProp = props.onClose;
					if (typeof onCloseProp === "function") {
						(onCloseProp as () => void)();
					}
					handleCloseModal(ModalComponent);
				};

				return (
					<ModalComponent
						key={id}
						{...(props as ModalInjectedProps)}
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
export function createOpenModalAction<Props extends ModalInjectedProps>(
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

export function createCloseModalAction<Props extends ModalInjectedProps>(
	ModalComponent?: ComponentType<Props>
) {
	console.warn(
		"closeModal action called outside of ModalProvider context. Use useModal hook instead."
	);
	return { type: "MODAL_CLOSE", payload: { ModalComponent } };
}
