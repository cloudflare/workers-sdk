import { useState } from "react";
import { DeleteConfirmationModal } from "../../utils/studio/stubs/ui/DeleteConfirmationModal";

interface StudioDropTableModalProps {
	closeModal: () => void;
	isOpen: boolean;
	onConfirm: () => Promise<void>;
	schemaName: string;
	tableName: string;
}

export function StudioDropTableModal({
	closeModal,
	isOpen,
	onConfirm,
	tableName,
}: StudioDropTableModalProps) {
	const [errorMessage, setErrorMessage] = useState("");

	return (
		<DeleteConfirmationModal
			challenge={tableName}
			title="Drop Table"
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
			failureText={errorMessage || "Unable to drop table"}
			body={
				<p>
					This action will permanently delete the table{" "}
					<strong>{tableName}</strong>. To confirm, please type the table name
					below. This action cannot be undone.
				</p>
			}
		/>
	);
}
