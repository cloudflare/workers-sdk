import { P } from "@cloudflare/elements";
import { useState } from "react";
import { DeleteConfirmationModal } from "../../utils/studio/stubs/ui/DeleteConfirmationModal";

type Props = {
	isOpen: boolean;
	onConfirm: () => Promise<void>;
	closeModal: () => void;
	name: string;
};

export function StudioDropSavedQueryModal({
	onConfirm,
	closeModal,
	isOpen,
	name,
}: Props) {
	const [errorMessage, setErrorMessage] = useState("");

	return (
		<DeleteConfirmationModal
			title="Drop Saved Query"
			isOpen={isOpen}
			closeModal={closeModal}
			onConfirm={async () => {
				try {
					await onConfirm();
				} catch (e) {
					if (e instanceof Error) {
						setErrorMessage(e.message);
					} else {
						setErrorMessage(e.toString());
					}

					throw e; // Rethrow the error to show the failure text
				}
			}}
			failureText={errorMessage || "Unable to drop saved query"}
			body={
				<P>
					This action will permanently delete the saved query{" "}
					<strong>{name}</strong>.
				</P>
			}
		/>
	);
}
