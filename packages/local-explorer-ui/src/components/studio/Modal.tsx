import { createContext, useCallback, useContext, useState } from "react";
import type { ComponentType, PropsWithChildren } from "react";

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

// Modal system requires flexible typing for heterogeneous component storage
interface ModalContextValue {
	openModal: <Props = unknown>(
		ModalComponent: ComponentType<Props>,
		props?: Omit<Props, keyof ModalInjectedProps> & { onClose?: () => void }
	) => void;
	closeModal: <Props = unknown>(ModalComponent?: ComponentType<Props>) => void;
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
		<Props = unknown,>(
			ModalComponent: ComponentType<Props>,
			props?: Omit<Props, keyof ModalInjectedProps> & { onClose?: () => void }
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
		<Props = unknown,>(ModalComponent?: ComponentType<Props>) => {
			setModals((prev) => {
				if (ModalComponent) {
					return prev.filter(
						(m) => (m.ModalComponent as unknown) !== (ModalComponent as unknown)
					);
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
 *
 * NOTE: Modal system requires flexible typing
 */
export function createOpenModalAction<Props = unknown>(
	ModalComponent: ComponentType<Props>,
	props?: Omit<Props, keyof ModalInjectedProps> & { onClose?: () => void }
) {
	// This is a placeholder - in the original code this returns a Redux action
	// In the portable version, use the useModal hook instead
	console.warn(
		"openModal action called outside of ModalProvider context. Use useModal hook instead."
	);
	return {
		payload: {
			ModalComponent,
			props,
		},
		type: "MODAL_OPEN",
	};
}

export function createCloseModalAction<Props = unknown>(
	ModalComponent?: ComponentType<Props>
) {
	console.warn(
		"closeModal action called outside of ModalProvider context. Use useModal hook instead."
	);
	return {
		payload: {
			ModalComponent,
		},
		type: "MODAL_CLOSE",
	};
}
