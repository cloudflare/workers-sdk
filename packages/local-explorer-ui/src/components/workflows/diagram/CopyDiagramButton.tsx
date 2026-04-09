import { Button, generateCloudflareLogoSvg, Tooltip } from "@cloudflare/kumo";
import {
	CheckIcon,
	CopyIcon,
	DownloadSimpleIcon,
	SpinnerIcon,
} from "@phosphor-icons/react";
import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type RefObject,
} from "react";

type CopyDiagramButtonProps = {
	contentRef: RefObject<HTMLDivElement | null>;
	workflowName?: string;
};

type ButtonState = "idle" | "busy" | "done";

const MIN_OUTPUT_WIDTH = 1200;
const MAX_SCALE = 4;
const MIN_SCALE = 2;
const MAX_PIXEL_AREA = 40_000_000;

function getScale(elementWidth: number, elementHeight: number): number {
	let scale = Math.min(
		MAX_SCALE,
		Math.max(MIN_SCALE, MIN_OUTPUT_WIDTH / elementWidth)
	);
	const pixels = elementWidth * scale * elementHeight * scale;
	if (pixels > MAX_PIXEL_AREA) {
		scale = Math.max(
			1,
			Math.sqrt(MAX_PIXEL_AREA / (elementWidth * elementHeight))
		);
	}
	return scale;
}

/**
 * Tailwind `ring` uses box-shadow which html2canvas cannot render.
 * Swap ring classes to border equivalents in the cloned DOM.
 */
function swapRingToBorderInClone(root: HTMLElement): void {
	const elements = root.querySelectorAll("*");
	const process = (el: Element) => {
		const classList = el.classList;
		if (!classList || !classList.contains("ring")) {
			return;
		}

		classList.remove("ring", "border-0");
		classList.add("border");

		const toRemove: string[] = [];
		const toAdd: string[] = [];
		classList.forEach((cls) => {
			if (cls.startsWith("ring-") && cls !== "ring-0") {
				toRemove.push(cls);
				toAdd.push("border-" + cls.slice(5));
			}
			if (cls.startsWith("dark:ring-")) {
				toRemove.push(cls);
				toAdd.push("dark:border-" + cls.slice(10));
			}
		});
		toRemove.forEach((cls) => classList.remove(cls));
		toAdd.forEach((cls) => classList.add(cls));
	};

	process(root);
	elements.forEach(process);
}

/**
 * Remove overflow/height constraints on ancestors so html2canvas
 * can render the full diagram.
 */
function unclipAncestors(el: HTMLElement): void {
	let current = el.parentElement;
	while (current && current !== el.ownerDocument.body) {
		current.style.overflow = "visible";
		current.style.maxHeight = "none";
		current.style.height = "auto";
		current = current.parentElement;
	}
}

async function renderToCanvas(
	element: HTMLDivElement,
	dark: boolean,
	scale: number
): Promise<HTMLCanvasElement> {
	const { default: html2canvas } = await import("html2canvas-pro");
	return html2canvas(element, {
		scale,
		backgroundColor: null,
		scrollY: -window.scrollY,
		scrollX: -window.scrollX,
		windowWidth: document.documentElement.offsetWidth,
		windowHeight: document.documentElement.offsetHeight,
		imageTimeout: 5000,
		onclone: (_doc: Document, clonedEl: HTMLElement) => {
			swapRingToBorderInClone(clonedEl);
			unclipAncestors(clonedEl);

			const bgColor = dark ? "#171717" : "#ffffff";
			const tintedBgColor = dark ? "#0a0a0a" : "#f5f5f5";
			clonedEl.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
				const val = el.style.getPropertyValue("--color-background");
				if (!val) {
					return;
				}
				if (val.includes("bg")) {
					el.style.setProperty("--color-background", bgColor);
				} else {
					el.style.setProperty("--color-background", tintedBgColor);
				}
			});
		},
	});
}

/**
 * Load an SVG string as an HTMLImageElement.
 */
function loadSvgAsImage(
	svg: string,
	width: number,
	height: number
): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.width = width;
		img.height = height;
		const timeout = setTimeout(
			() => reject(new Error("SVG logo load timeout")),
			5000
		);
		img.onload = () => {
			clearTimeout(timeout);
			resolve(img);
		};
		img.onerror = (e) => {
			clearTimeout(timeout);
			reject(e);
		};
		img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
	});
}

/** Full logo (cloud + "CLOUDFLARE" wordmark) intrinsic viewBox: 0 0 101.4 33.5 */
const LOGO_ASPECT_RATIO = 101.4 / 33.5;

/**
 * Composites the exported diagram with a header, dot grid background,
 * Cloudflare logo, and a small footer.
 */
async function compositeExportImage(
	source: HTMLCanvasElement,
	dark: boolean,
	scale: number,
	workflowName?: string
): Promise<HTMLCanvasElement> {
	const sidePadding = 32 * scale;
	const headerHeight = 44 * scale;
	const footerHeight = 24 * scale;

	// Logo
	const logoHeight = 22 * scale;
	const logoWidth = Math.round(logoHeight * LOGO_ASPECT_RATIO);
	const logoSvg = generateCloudflareLogoSvg({
		variant: "full",
		color: dark ? "white" : "color",
	});
	const logoImg = await loadSvgAsImage(logoSvg, logoWidth, logoHeight);

	const output = document.createElement("canvas");
	output.width = source.width + sidePadding * 2;
	output.height = headerHeight + source.height + footerHeight;
	const ctx = output.getContext("2d");
	if (!ctx) {
		throw new Error("Failed to create canvas 2D context");
	}

	// Fill background
	ctx.fillStyle = dark ? "#171717" : "#ffffff";
	ctx.fillRect(0, 0, output.width, output.height);

	// Draw dot grid pattern
	const dotSpacing = 16 * scale;
	const dotRadius = 1 * scale;
	ctx.fillStyle = dark ? "#262626" : "#d4d4d4";
	ctx.beginPath();
	for (let y = dotSpacing / 2; y < output.height; y += dotSpacing) {
		for (let x = dotSpacing / 2; x < output.width; x += dotSpacing) {
			ctx.moveTo(x + dotRadius, y);
			ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
		}
	}
	ctx.fill();

	// Draw diagram centered
	ctx.drawImage(source, sidePadding, headerHeight);

	// Header: workflow name
	if (workflowName) {
		const fontSize = Math.round(14 * scale);
		ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
		ctx.fillStyle = dark ? "#a3a3a3" : "#525252";
		ctx.textBaseline = "middle";
		ctx.textAlign = "center";
		ctx.fillText(
			workflowName,
			output.width / 2,
			headerHeight / 2,
			output.width - sidePadding * 2
		);
	}

	// Logo: bottom-right corner
	const logoMargin = 12 * scale;
	const logoX = output.width - logoWidth - logoMargin;
	const logoY = output.height - logoHeight - logoMargin;
	ctx.drawImage(logoImg, logoX, logoY, logoWidth, logoHeight);

	return output;
}

async function captureImage(
	element: HTMLDivElement,
	workflowName?: string
): Promise<HTMLCanvasElement> {
	const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
	const scale = getScale(element.scrollWidth, element.scrollHeight);
	const rawCanvas = await renderToCanvas(element, dark, scale);
	return compositeExportImage(rawCanvas, dark, scale, workflowName);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
	return new Promise((resolve) => canvas.toBlob(resolve));
}

export function CopyDiagramButton({
	contentRef,
	workflowName,
}: CopyDiagramButtonProps) {
	const [copyState, setCopyState] = useState<ButtonState>("idle");
	const [downloadState, setDownloadState] = useState<ButtonState>("idle");
	const copyTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
	const downloadTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
	const busyRef = useRef(false);

	useEffect(() => {
		return () => {
			clearTimeout(copyTimerRef.current);
			clearTimeout(downloadTimerRef.current);
		};
	}, []);

	const isBusy = copyState === "busy" || downloadState === "busy";

	const handleCopyToClipboard = useCallback(async () => {
		if (!contentRef.current || busyRef.current) {
			return;
		}
		busyRef.current = true;
		setCopyState("busy");
		try {
			const canvas = await captureImage(contentRef.current, workflowName);
			const blob = await canvasToBlob(canvas);
			if (!blob) {
				setCopyState("idle");
			} else if (!document.hasFocus()) {
				setCopyState("idle");
			} else {
				await navigator.clipboard.write([
					new ClipboardItem({ [blob.type]: blob }),
				]);
				clearTimeout(copyTimerRef.current);
				setCopyState("done");
				copyTimerRef.current = setTimeout(() => setCopyState("idle"), 2000);
			}
		} catch {
			setCopyState("idle");
		} finally {
			busyRef.current = false;
		}
	}, [contentRef, workflowName]);

	const handleDownloadPng = useCallback(async () => {
		if (!contentRef.current || busyRef.current) {
			return;
		}
		busyRef.current = true;
		setDownloadState("busy");
		try {
			const canvas = await captureImage(contentRef.current, workflowName);
			const blob = await canvasToBlob(canvas);
			if (!blob) {
				setDownloadState("idle");
				return;
			}
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			const safeName =
				(workflowName ?? "workflow").replace(/[^\w-]/g, "_") || "workflow";
			link.download = `${safeName}-diagram.png`;
			link.href = url;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 100);
			clearTimeout(downloadTimerRef.current);
			setDownloadState("done");
			downloadTimerRef.current = setTimeout(
				() => setDownloadState("idle"),
				2000
			);
		} catch {
			setDownloadState("idle");
		} finally {
			busyRef.current = false;
		}
	}, [contentRef, workflowName]);

	const copyIcon =
		copyState === "done" ? (
			<CheckIcon size={16} className="text-kumo-success" />
		) : copyState === "busy" ? (
			<SpinnerIcon size={16} className="animate-spin" />
		) : (
			<CopyIcon size={16} />
		);

	const downloadIcon =
		downloadState === "done" ? (
			<CheckIcon size={16} className="text-kumo-success" />
		) : downloadState === "busy" ? (
			<SpinnerIcon size={16} className="animate-spin" />
		) : (
			<DownloadSimpleIcon size={16} />
		);

	return (
		<div
			data-html2canvas-ignore
			className="flex overflow-hidden rounded-md shadow-xs ring ring-kumo-fill"
		>
			<Tooltip content="Copy to clipboard" side="bottom" asChild>
				<Button
					onClick={() => void handleCopyToClipboard()}
					disabled={isBusy}
					aria-label="Copy diagram to clipboard"
					shape="square"
					size="sm"
					className="rounded-none bg-kumo-base shadow-none ring-0 hover:!bg-kumo-tint"
				>
					{copyIcon}
				</Button>
			</Tooltip>
			<div className="w-px bg-kumo-fill" />
			<Tooltip content="Download as PNG" side="bottom" asChild>
				<Button
					onClick={() => void handleDownloadPng()}
					disabled={isBusy}
					aria-label="Download diagram as PNG"
					shape="square"
					size="sm"
					className="rounded-none bg-kumo-base shadow-none ring-0 hover:!bg-kumo-tint"
				>
					{downloadIcon}
				</Button>
			</Tooltip>
		</div>
	);
}
