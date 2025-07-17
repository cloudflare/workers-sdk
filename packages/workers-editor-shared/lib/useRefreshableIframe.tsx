import {
	useContext,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import Frame from "./Frame";
import { DragContext } from "./SplitPane";

/**
 * A wrapper around an iframe that loads any changes to the src in the background,
 * keeping around the current content in the meantime. It does this by listening
 * to the "load" event and swapping between two underlying iframe elements
 */
export function useRefreshableIframe(
	src: string | undefined,
	onLoad: (frame: HTMLIFrameElement) => void
) {
	const isPaneDragging = useContext(DragContext);
	const refs = [
		useRef<HTMLIFrameElement>(null),
		useRef<HTMLIFrameElement>(null),
	];
	const [index, setIndex] = useState(0);

	const [isLoadingContent, setIsLoadingContent] = useState(false);

	const [firstLoad, setFirstLoad] = useState(false);

	useEffect(() => {
		function onLoadEvent(this: HTMLIFrameElement) {
			onLoad(this);
		}
		const first = refs[0].current;
		const second = refs[1].current;
		if (first && second) {
			first.addEventListener("load", onLoadEvent);
			second.addEventListener("load", onLoadEvent);
			return () => {
				first.removeEventListener("load", onLoadEvent);
				second.removeEventListener("load", onLoadEvent);
			};
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [onLoad]);

	function listen() {
		if (!firstLoad) {
			setFirstLoad(true);
		}
		requestAnimationFrame(() => {
			setIndex(index === 0 ? 1 : 0);
			setIsLoadingContent(false);
		});
	}
	function setUrl(url: string) {
		setIsLoadingContent(true);
		const nextIndex = index === 0 ? 1 : 0;
		const nextRef = refs[nextIndex].current;
		if (nextRef) {
			if (isLoadingContent) {
				nextRef.removeEventListener("load", listen);
			}
			nextRef.addEventListener("load", listen, {
				once: true,
			});
			nextRef.src = url;
		}
	}
	useLayoutEffect(() => {
		if (src) {
			setUrl(src);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [src]);
	const isLoading = isLoadingContent;
	return {
		firstLoad,
		isLoading,
		refresh() {
			if (src) {
				setUrl(src);
			}
		},
		frame: (
			<>
				<Frame
					innerRef={refs[0]}
					style={{
						opacity: index === 0 ? 1 : 0,
						zIndex: index === 0 ? 10 : 5,
						pointerEvents: isLoading || isPaneDragging ? "none" : "auto",
					}}
					sandbox="allow-forms allow-modals allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox"
				/>
				<Frame
					innerRef={refs[1]}
					style={{
						opacity: index === 1 ? 1 : 0,
						zIndex: index === 1 ? 10 : 5,
						pointerEvents: isLoading || isPaneDragging ? "none" : "auto",
					}}
					sandbox="allow-forms allow-modals allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox"
				/>
			</>
		),
	};
}
