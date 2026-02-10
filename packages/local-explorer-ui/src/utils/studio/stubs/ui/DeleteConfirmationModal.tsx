import { Button, Dialog, Text } from "@cloudflare/kumo";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

/**
 * Stub for DeleteConfirmationModal
 * Simplified version using @cloudflare/kumo Dialog component
 */

type DeleteConfirmationModalProps = {
	title: ReactNode;
	body: ReactNode;
	isOpen: boolean;
	confirmDisabled?: boolean;
	confirmType?: "primary" | "danger";
	challenge?: string;
	onConfirm: (e: FormEvent<HTMLFormElement>) => Promise<void> | void;
	closeModal: () => void;
	confirmationText?: string;
	failureText?: ReactNode;
};

export const DeleteConfirmationModal = ({
	title,
	body,
	isOpen,
	confirmDisabled,
	confirmType = "danger",
	closeModal,
	confirmationText = "Delete",
	challenge,
	failureText,
	onConfirm,
}: DeleteConfirmationModalProps) => {
	const [isRequesting, setIsRequesting] = useState(false);
	const [challengeInput, setChallengeInput] = useState("");
	const [deleteFailed, setDeleteFailed] = useState(false);

	const isValid = !challenge || challengeInput === challenge;

	const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setIsRequesting(true);
		try {
			await onConfirm(e);
			closeModal();
		} catch (err) {
			setIsRequesting(false);
			if (failureText) {
				setDeleteFailed(true);
			} else {
				throw err;
			}
		}
	};

	return (
		<Dialog.Root
			open={isOpen}
			onOpenChange={(open: boolean) => {
				if (!open) {
					closeModal();
				}
			}}
		>
			<Dialog>
				<Dialog.Title>{title}</Dialog.Title>
				<form onSubmit={handleSubmit}>
					<div className="space-y-4">
						{body}
						{challenge && (
							<div className="space-y-2">
								<Text size="sm">
									Type <strong>{challenge}</strong> to confirm
								</Text>
								<input
									className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
									value={challengeInput}
									onChange={(e) => setChallengeInput(e.target.value)}
									autoComplete="off"
									autoFocus
								/>
							</div>
						)}
						{deleteFailed && (
							<div className="rounded-md bg-red-50 p-3 text-red-700">
								{failureText}
							</div>
						)}
					</div>
					<div className="flex gap-2 justify-end mt-4">
						<Button variant="secondary" onClick={closeModal}>
							Cancel
						</Button>
						<Button
							variant={confirmType === "danger" ? "destructive" : "primary"}
							type="submit"
							loading={isRequesting}
							disabled={confirmDisabled || !isValid}
						>
							{confirmationText}
						</Button>
					</div>
				</form>
			</Dialog>
		</Dialog.Root>
	);
};
