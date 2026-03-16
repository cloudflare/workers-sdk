import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Button } from "@base-ui/react/button";
import { PlusIcon, TrashIcon, UploadIcon } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { r2BucketPutObject } from "../api";

interface R2UploadDialogProps {
	bucketName: string;
	currentPrefix: string;
	onOpenChange: (open: boolean) => void;
	onUploadComplete: () => void;
	open: boolean;
}

interface MetadataEntry {
	key: string;
	value: string;
}

const MIME_TYPES = {
	css: "text/css",
	gif: "image/gif",
	html: "text/html",
	jpeg: "image/jpeg",
	jpg: "image/jpeg",
	js: "application/javascript",
	json: "application/json",
	mp3: "audio/mpeg",
	mp4: "video/mp4",
	pdf: "application/pdf",
	png: "image/png",
	svg: "image/svg+xml",
	txt: "text/plain",
	wasm: "application/wasm",
	webp: "image/webp",
	xml: "application/xml",
	zip: "application/zip",
} as Record<string, string>;

function getMimeType(file: File): string {
	if (file.type) {
		return file.type;
	}

	const ext = file.name.split(".").pop()?.toLowerCase();
	return MIME_TYPES[ext ?? ""] ?? "application/octet-stream";
}

export function R2UploadDialog({
	bucketName,
	currentPrefix,
	onOpenChange,
	onUploadComplete,
	open,
}: R2UploadDialogProps): JSX.Element {
	const [contentType, setContentType] = useState<string>("");
	const [customMetadata, setCustomMetadata] = useState<MetadataEntry[]>([]);
	const [dragOver, setDragOver] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [file, setFile] = useState<File | null>(null);
	const [objectKey, setObjectKey] = useState<string>("");
	const [uploading, setUploading] = useState<boolean>(false);

	const resetForm = useCallback(() => {
		setFile(null);
		setObjectKey("");
		setContentType("");
		setCustomMetadata([]);
		setError(null);
	}, []);

	function handleFileSelect(selectedFile: File): void {
		setFile(selectedFile);
		setObjectKey(currentPrefix + selectedFile.name);
		setContentType(getMimeType(selectedFile));
	}

	function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
		const [selectedFile] = e.target.files ?? [];
		if (!selectedFile) {
			return;
		}

		handleFileSelect(selectedFile);
	}

	function handleDrop(e: React.DragEvent<HTMLDivElement>): void {
		e.preventDefault();
		setDragOver(false);

		const droppedFile = e.dataTransfer.files[0];
		if (!droppedFile) {
			return;
		}

		handleFileSelect(droppedFile);
	}

	function handleDragOver(e: React.DragEvent<HTMLDivElement>): void {
		e.preventDefault();
		setDragOver(true);
	}

	function handleDragLeave(e: React.DragEvent<HTMLDivElement>): void {
		e.preventDefault();
		setDragOver(false);
	}

	function handleAddMetadata(): void {
		setCustomMetadata([
			...customMetadata,
			{
				key: "",
				value: "",
			},
		]);
	}

	function handleRemoveMetadata(index: number): void {
		setCustomMetadata(customMetadata.filter((_, i) => i !== index));
	}

	function handleMetadataChange(
		index: number,
		field: "key" | "value",
		value: string
	): void {
		const updated = [...customMetadata];
		const entry = updated[index];
		if (!entry) {
			return;
		}

		entry[field] = value;
		setCustomMetadata(updated);
	}

	async function handleUpload(): Promise<void> {
		if (!file || !objectKey.trim()) {
			setError("Please select a file and provide an object key");
			return;
		}

		try {
			setUploading(true);
			setError(null);

			const metadata: Record<string, string> = {};
			for (const entry of customMetadata) {
				if (entry.key.trim()) {
					metadata[entry.key.trim()] = entry.value;
				}
			}

			await r2BucketPutObject({
				path: { bucket_name: bucketName, object_key: objectKey.trim() },
				body: file,
				headers: {
					"content-type": contentType || "application/octet-stream",
					"cf-r2-custom-metadata":
						Object.keys(metadata).length > 0
							? JSON.stringify(metadata)
							: undefined,
				},
			});

			resetForm();
			onUploadComplete();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to upload object");
		} finally {
			setUploading(false);
		}
	}

	function handleOpenChange(newOpen: boolean): void {
		if (!newOpen) {
			resetForm();
		}

		onOpenChange(newOpen);
	}

	return (
		<AlertDialog.Root open={open} onOpenChange={handleOpenChange}>
			<AlertDialog.Portal>
				<AlertDialog.Backdrop className="fixed inset-0 z-1000 flex items-center justify-center bg-black/50 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
				<AlertDialog.Popup className="fixed top-1/2 left-1/2 z-1001 w-full max-w-150 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-bg p-6 shadow-[0_4px_24px_rgba(0,0,0,0.15),0_0_0_1px_var(--color-border)] transition-[opacity,transform] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
					<AlertDialog.Title className="mb-4 text-lg font-semibold">
						Upload object
					</AlertDialog.Title>

					{error && (
						<div className="mb-4 rounded-md border border-danger/20 bg-danger/8 p-3 text-sm text-danger">
							{error}
						</div>
					)}

					{/* File Drop Zone */}
					<div
						className={`mb-4 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
							dragOver
								? "border-primary bg-primary/5"
								: "border-border hover:border-primary/50"
						}`}
						onClick={() => document.getElementById("file-input")?.click()}
						onDragLeave={handleDragLeave}
						onDragOver={handleDragOver}
						onDrop={handleDrop}
					>
						<input
							className="hidden"
							id="file-input"
							onChange={handleFileChange}
							type="file"
						/>

						<UploadIcon size={32} className="mb-2 text-text-secondary" />

						{file ? (
							<>
								<p className="text-sm font-medium text-text">{file.name}</p>
								<p className="text-xs text-text-secondary">
									{(file.size / 1024).toFixed(1)} KB
								</p>
							</>
						) : (
							<>
								<p className="text-sm text-text">
									Drop a file here or click to browse
								</p>
								<p className="text-xs text-text-secondary">
									Any file type supported
								</p>
							</>
						)}
					</div>

					{/* Object Key */}
					<div className="mb-4">
						<label className="mb-1 block text-sm font-medium text-text">
							Object key
						</label>
						<input
							className="w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm text-text focus:border-primary focus:shadow-focus-primary focus:outline-none"
							onChange={(e) => setObjectKey(e.target.value)}
							placeholder={currentPrefix + "filename.ext"}
							type="text"
							value={objectKey}
						/>
						<p className="mt-1 text-xs text-text-secondary">
							The full path where the object will be stored
						</p>
					</div>

					{/* Content Type */}
					<div className="mb-4">
						<label className="mb-1 block text-sm font-medium text-text">
							Content-Type
						</label>
						<input
							className="w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm text-text focus:border-primary focus:shadow-focus-primary focus:outline-none"
							onChange={(e) => setContentType(e.target.value)}
							placeholder="application/octet-stream"
							type="text"
							value={contentType}
						/>
					</div>

					{/* Custom Metadata */}
					<div className="mb-4">
						<div className="mb-2 flex items-center justify-between">
							<label className="text-sm font-medium text-text">
								Custom metadata
							</label>
							<Button
								className="inline-flex cursor-pointer items-center gap-1 rounded-md border-none bg-transparent px-2 py-1 text-xs text-primary transition-colors hover:bg-primary/10"
								onClick={handleAddMetadata}
							>
								<PlusIcon size={12} />
								Add
							</Button>
						</div>

						{customMetadata.length === 0 ? (
							<p className="text-sm text-text-secondary italic">
								No custom metadata
							</p>
						) : (
							<div className="space-y-2">
								{customMetadata.map((entry, index) => (
									<div key={index} className="flex items-center gap-2">
										<input
											className="flex-1 rounded-md border border-border bg-bg px-2 py-1.5 font-mono text-sm text-text focus:border-primary focus:shadow-focus-primary focus:outline-none"
											onChange={(e) =>
												handleMetadataChange(index, "key", e.target.value)
											}
											placeholder="key"
											type="text"
											value={entry.key}
										/>
										<input
											className="flex-1 rounded-md border border-border bg-bg px-2 py-1.5 font-mono text-sm text-text focus:border-primary focus:shadow-focus-primary focus:outline-none"
											onChange={(e) =>
												handleMetadataChange(index, "value", e.target.value)
											}
											placeholder="value"
											type="text"
											value={entry.value}
										/>
										<Button
											className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-text-secondary transition-colors hover:bg-danger/10 hover:text-danger"
											onClick={() => handleRemoveMetadata(index)}
										>
											<TrashIcon size={14} />
										</Button>
									</div>
								))}
							</div>
						)}
					</div>

					<div className="flex justify-end gap-2">
						<AlertDialog.Close
							render={
								<Button className="inline-flex cursor-pointer items-center justify-center rounded-md border border-none border-border bg-bg-tertiary px-4 py-2 text-sm font-medium text-text transition-[background-color,transform] hover:bg-border active:translate-y-px data-disabled:cursor-not-allowed data-disabled:opacity-60 data-disabled:active:translate-y-0" />
							}
							disabled={uploading}
						>
							Cancel
						</AlertDialog.Close>

						<Button
							className="inline-flex cursor-pointer items-center justify-center rounded-md border-none bg-primary px-4 py-2 text-sm font-medium text-white transition-[background-color,transform] hover:bg-primary-hover active:translate-y-px data-disabled:cursor-not-allowed data-disabled:opacity-60 data-disabled:active:translate-y-0"
							disabled={uploading || !file}
							focusableWhenDisabled
							onClick={handleUpload}
						>
							{uploading ? "Uploading..." : "Upload"}
						</Button>
					</div>
				</AlertDialog.Popup>
			</AlertDialog.Portal>
		</AlertDialog.Root>
	);
}
