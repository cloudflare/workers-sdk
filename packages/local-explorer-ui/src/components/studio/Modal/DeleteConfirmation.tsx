import { Button, Dialog, Text } from "@cloudflare/kumo";
import { useState } from "react";
import type { ReactNode, SubmitEvent } from "react";

interface StudioDeleteConfirmationModalProps {
	body: ReactNode;
	challenge?: string;
	closeModal: () => void;
	confirmationText?: string;
	confirmDisabled?: boolean;
	confirmType?: "primary" | "danger";
	failureText?: ReactNode;
	isOpen: boolean;
	onConfirm: (e: SubmitEvent<HTMLFormElement>) => Promise<void> | void;
	title: ReactNode;
}

export const StudioDeleteConfirmationModal = ({
	body,
	challenge,
	closeModal,
	confirmationText = "Delete",
	confirmDisabled,
	confirmType = "danger",
	failureText,
	isOpen,
	onConfirm,
	title,
}: StudioDeleteConfirmationModalProps) => {
	const [challengeInput, setChallengeInput] = useState<string>("");
	const [deleteFailed, setDeleteFailed] = useState<boolean>(false);
	const [isRequesting, setIsRequesting] = useState<boolean>(false);

	const isValid = !challenge || challengeInput === challenge;

	const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
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
			onOpenChange={(open: boolean) => {
				if (!open) {
					closeModal();
				}
			}}
			open={isOpen}
		>
			<Dialog className="p-6">
				<div className="mb-4 flex items-start justify-between gap-4">
					{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
					<Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
				</div>

				<form onSubmit={handleSubmit}>
					<div className="space-y-4">
						{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
						<Dialog.Description className="text-kumo-subtle">
							{body}
						</Dialog.Description>

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

					<div className="mt-4 flex justify-end gap-2">
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
