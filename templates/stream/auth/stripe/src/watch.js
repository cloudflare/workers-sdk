const urlParams = new URLSearchParams(window.location.search);
const signedUrl = urlParams.get("signedUrl");

if (signedUrl) {
	// Render the Stream Player, using the signed URL passed to this page as a query param.
	// You can use Cloudflare Stream with any video player that supports HLS or DASH playback.
	// For more, see: https://developers.cloudflare.com/stream/viewing-videos/using-own-player/
	document.getElementById("stream-player").innerHTML = `
		<iframe
			src="${signedUrl}"
			style="border: none; position: absolute; top: 0; left: 0; height: 100%; width: 100%"
			allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
			allowfullscreen="true"
		></iframe>
	`;
}
