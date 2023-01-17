// Replace the manifest URI with an HLS or DASH manifest from Cloudflare Stream
const manifestUri =
	"https://customer-m033z5x00ks6nunl.cloudflarestream.com/b236bde30eb07b9d01318940e5fc3eda/manifest/video.mpd";

function initApp() {
	// Install built-in polyfills to patch browser incompatibilities.
	shaka.polyfill.installAll();

	// Check to see if the browser supports the basic APIs Shaka needs.
	if (shaka.Player.isBrowserSupported()) {
		// Everything looks good!
		initPlayer();
	} else {
		// This browser does not have the minimum set of APIs we need.
		console.error("Browser not supported!");
	}
}

function onErrorEvent(event) {
	// Extract the shaka.util.Error object from the event.
	onError(event.detail);
}

function onError(error) {
	// Log the error.
	console.error("Error code", error.code, "object", error);
}

async function initPlayer() {
	// Create a Player instance.
	const video = document.getElementById("video");
	const player = new shaka.Player(video);

	// Attach player to the window to make it easy to access in the JS console.
	window.player = player;

	// Listen for error events.
	player.addEventListener("error", onErrorEvent);

	// Try to load a manifest.
	// This is an asynchronous process.
	try {
		await player.load(manifestUri);
		// This runs if the asynchronous load is successful.
		console.log("The video has now been loaded!");
	} catch (e) {
		// onError is executed if the asynchronous load fails.
		onError(e);
	}
}

document.addEventListener("DOMContentLoaded", initApp);
