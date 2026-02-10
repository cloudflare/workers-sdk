import { Dialog } from "@cloudflare/kumo";
import { useCallback, useState } from "react";
import type { ReactNode } from "react";

/**
 * Stub for ConfirmationModal
 * Simplified version using @cloudflare/kumo Dialog component
 */

export interface ModalInjectedProps {
	closeModal: () => void;
	isOpen?: boolean;
}

export interface ModalHandlers extends ModalInjectedProps {
	onConfirm: (...args: unknown[]) => void;
	onCancel?: (...args: unknown[]) => void;
}

type Props = ModalHandlers & {
	title: ReactNode;
	body: ReactNode;
	actions: (args: {
		closeModal: () => void;
		onConfirm: (...args: unknown[]) => void;
		isRequesting: boolean;
	}) => ReactNode;
	simple?: boolean;
	width?: "narrow" | "wide";
};

export const ConfirmationModal = ({
	title,
	body,
	actions,
	isOpen,
	onCancel: _onCancel,
	onConfirm: _onConfirm,
	closeModal,
}: Props) => {
	const [isRequesting, setIsRequesting] = useState(false);

	const onConfirm = useCallback(
		async (...args: unknown[]) => {
			setIsRequesting(true);
			try {
				await _onConfirm(...args);
				closeModal();
			} finally {
				setIsRequesting(false);
			}
		},
		[_onConfirm, closeModal]
	);

	const onCancel = useCallback(() => {
		closeModal();
		_onCancel?.();
	}, [_onCancel, closeModal]);

	return (
		<Dialog.Root
			open={!!isOpen}
			onOpenChange={(open: boolean) => {
				if (!open) {
					onCancel();
				}
			}}
		>
			<Dialog>
				<Dialog.Title>{title}</Dialog.Title>
				<div>{body}</div>
				<div className="flex gap-2 justify-end mt-4">
					{actions({ isRequesting, onConfirm, closeModal: onCancel })}
				</div>
			</Dialog>
		</Dialog.Root>
	);
};
