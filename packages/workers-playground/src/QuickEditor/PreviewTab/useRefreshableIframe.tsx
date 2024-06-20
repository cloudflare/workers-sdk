import {
	useCallback,
	useContext,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import Frame from "../Frame";
import { DragContext } from "../SplitPane";

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
	const refs = useRef([
		useRef<HTMLIFrameElement>(null),
		useRef<HTMLIFrameElement>(null),
	]);
	const [index, setIndex] = useState(0);

	const [isLoadingContent, setIsLoadingContent] = useState(false);

	const [firstLoad, setFirstLoad] = useState(false);

	useEffect(() => {
		function onLoadEvent(this: HTMLIFrameElement) {
			onLoad(this);
		}
		const first = refs.current[0].current;
		const second = refs.current[1].current;
		if (first && second) {
			first.addEventListener("load", onLoadEvent);
			second.addEventListener("load", onLoadEvent);
			return () => {
				first.removeEventListener("load", onLoadEvent);
				second.removeEventListener("load", onLoadEvent);
			};
		}
	}, [onLoad]);

	const setUrl = useCallback(
		function setUrl(url: string) {
			function listen() {
				!firstLoad && setFirstLoad(true);
				requestAnimationFrame(() => {
					setIndex(index === 0 ? 1 : 0);
					setIsLoadingContent(false);
				});
			}

			setIsLoadingContent(true);
			const nextIndex = index === 0 ? 1 : 0;
			const nextRef = refs.current[nextIndex].current;
			if (nextRef) {
				if (isLoadingContent) {
					nextRef.removeEventListener("load", listen);
				}
				nextRef.addEventListener("load", listen, {
					once: true,
				});
				nextRef.src = url;
			}
		},
		[firstLoad, index, isLoadingContent]
	);
	useLayoutEffect(() => {
		if (src) {
			setUrl(src);
		}
	}, [src, setUrl]);
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
					innerRef={refs.current[0]}
					style={{
						opacity: index === 0 ? 1 : 0,
						zIndex: index === 0 ? 10 : 5,
						pointerEvents: isLoading || isPaneDragging ? "none" : "auto",
					}}
					sandbox="allow-forms allow-modals allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox"
				/>
				<Frame
					innerRef={refs.current[1]}
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
