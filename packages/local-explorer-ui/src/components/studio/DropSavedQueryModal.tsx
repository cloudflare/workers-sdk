import { useState } from "react";
import { DeleteConfirmationModal } from "../../utils/studio/stubs/ui/DeleteConfirmationModal";

interface StudioDropSavedQueryModalProps {
	closeModal: () => void;
	isOpen: boolean;
	name: string;
	onConfirm: () => Promise<void>;
}

export function StudioDropSavedQueryModal({
	closeModal,
	isOpen,
	name,
	onConfirm,
}: StudioDropSavedQueryModalProps) {
	const [errorMessage, setErrorMessage] = useState("");

	return (
		<DeleteConfirmationModal
			title="Drop Saved Query"
			isOpen={isOpen}
			closeModal={closeModal}
			onConfirm={async () => {
				try {
					await onConfirm();
				} catch (err) {
					if (err instanceof Error) {
						setErrorMessage(err.message);
					} else {
						setErrorMessage(String(err));
					}

					throw err; // Rethrow the error to show the failure text
				}
			}}
			failureText={errorMessage || "Unable to drop saved query"}
			body={
				<p>
					This action will permanently delete the saved query{" "}
					<strong>{name}</strong>.
				</p>
			}
		/>
	);
}
