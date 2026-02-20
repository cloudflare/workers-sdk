import { cn } from "@cloudflare/kumo";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/**
 * Simple Modal component stub
 * Uses native dialog element with Tailwind styling
 */

interface ModalProps {
	isOpen: boolean;
	onClose: () => void;
	children: ReactNode;
	className?: string;
}

export function Modal({ isOpen, onClose, children, className }: ModalProps) {
	const dialogRef = useRef<HTMLDialogElement>(null);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) {
			return;
		}

		if (isOpen) {
			dialog.showModal();
		} else {
			dialog.close();
		}
	}, [isOpen]);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) {
			return;
		}

		const handleCancel = (e: Event) => {
			e.preventDefault();
			onClose();
		};

		const handleClick = (e: MouseEvent) => {
			if (e.target === dialog) {
				onClose();
			}
		};

		dialog.addEventListener("cancel", handleCancel);
		dialog.addEventListener("click", handleClick);

		return () => {
			dialog.removeEventListener("cancel", handleCancel);
			dialog.removeEventListener("click", handleClick);
		};
	}, [onClose]);

	return (
		<dialog
			ref={dialogRef}
			className={cn(
				"rounded-lg border border-border bg-surface p-0 shadow-xl backdrop:bg-black/50",
				className
			)}
		>
			{children}
		</dialog>
	);
}
