import { useState } from "react";
import { DeleteConfirmationModal } from "../../utils/studio/stubs/ui/DeleteConfirmationModal";

type Props = {
	isOpen: boolean;
	onConfirm: (name: string) => Promise<void>;
	closeModal: () => void;
	title?: string;
	name?: string;
	confirmationText?: string;
};

export function StudioCreateSavedQueryModal({
	onConfirm,
	closeModal,
	isOpen,
	title,
	name,
	confirmationText,
}: Props) {
	const [errorMessage, setErrorMessage] = useState("");
	const [queryName, setQueryName] = useState("");

	return (
		<DeleteConfirmationModal
			title={title || "Create Saved Query"}
			isOpen={isOpen}
			closeModal={closeModal}
			confirmType="primary"
			confirmationText={confirmationText || "common.create"}
			onConfirm={async () => {
				try {
					await onConfirm(queryName);
				} catch (err) {
					if (err instanceof Error) {
						setErrorMessage(err.message);
					} else {
						setErrorMessage(String(err));
					}

					throw err; // Rethrow the error to show the failure text
				}
			}}
			failureText={errorMessage || "Unable to create saved query"}
			body={
				<input
					className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-neutral-800 dark:border-neutral-600"
					defaultValue={name}
					name="queryName"
					onChange={(e) => setQueryName(e.target.value)}
					placeholder="Query name"
					type="text"
				/>
			}
		/>
	);
}
