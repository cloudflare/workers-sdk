import { Input } from "@cloudflare/component-input";
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
				} catch (e) {
					if (e instanceof Error) {
						setErrorMessage(e.message);
					} else {
						setErrorMessage(e.toString());
					}

					throw e; // Rethrow the error to show the failure text
				}
			}}
			failureText={errorMessage || "Unable to create saved query"}
			body={
				<Input
					defaultValue={name}
					name="queryName"
					onChange={(e) => setQueryName(e.target.value)}
					placeholder="Query name"
					width="100%"
				/>
			}
		/>
	);
}
