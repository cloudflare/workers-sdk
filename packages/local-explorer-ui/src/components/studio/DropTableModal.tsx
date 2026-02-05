import { P } from "@cloudflare/elements";
import { useState } from "react";
import { DeleteConfirmationModal } from "../../utils/studio/stubs/ui/DeleteConfirmationModal";

type Props = {
	isOpen: boolean;
	onConfirm: () => Promise<void>;
	closeModal: () => void;
	schemaName: string;
	tableName: string;
};

export function StudioDropTableModal({
	onConfirm,
	closeModal,
	isOpen,
	tableName,
}: Props) {
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
				} catch (e) {
					if (e instanceof Error) {
						setErrorMessage(e.message);
					} else {
						setErrorMessage(e.toString());
					}

					throw e; // Rethrow the error to show the failure text
				}
			}}
			failureText={errorMessage || "Unable to drop table"}
			body={
				<P>
					This action will permanently delete the table{" "}
					<strong>{tableName}</strong>. To confirm, please type the table name
					below. This action cannot be undone.
				</P>
			}
		/>
	);
}
