import { createContext, useCallback, useContext, useState } from "react";
import type { ComponentType, PropsWithChildren } from "react";

interface ModalInjectedProps {
	closeModal: () => void;
	isOpen?: boolean;
}

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
	closeModal: <Props = unknown>(ModalComponent?: ComponentType<Props>) => void;
	openModal: <Props = unknown>(
		ModalComponent: ComponentType<Props>,
		props?: Omit<Props, keyof ModalInjectedProps> & { onClose?: () => void }
	) => void;
}

const ModalContext = createContext<ModalContextValue | null>(null);

export function useModal(): ModalContextValue {
	const context = useContext(ModalContext);
	if (!context) {
		throw new Error("useModal must be used within a ModalProvider");
	}

	return context;
}

/**
 * Simple modal provider for the portable Studio component
 */
export function ModalProvider({ children }: PropsWithChildren): JSX.Element {
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
			value={{
				closeModal: handleCloseModal,
				openModal: handleOpenModal,
			}}
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
						{...(props as unknown as ModalInjectedProps)}
						closeModal={onClose}
						isOpen={true}
					/>
				);
			})}
		</ModalContext.Provider>
	);
}
