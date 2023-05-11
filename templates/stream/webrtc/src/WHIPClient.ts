import negotiateConnectionWithClientOffer from "./negotiateConnectionWithClientOffer.js";

/**
 * Example implementation of a client that uses WHIP to broadcast video over WebRTC
 *
 * https://www.ietf.org/archive/id/draft-ietf-wish-whip-01.html
 */
export default class WHIPClient {
	private peerConnection: RTCPeerConnection;
	private localStream?: MediaStream;

	constructor(
		private endpoint: string,
		private videoElement: HTMLVideoElement
	) {
		/**
		 * Create a new WebRTC connection, using public STUN servers with ICE,
		 * allowing the client to disover its own IP address.
		 * https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols#ice
		 */
		this.peerConnection = new RTCPeerConnection({
			iceServers: [
				{
					urls: "stun:stun.cloudflare.com:3478",
				},
			],
			bundlePolicy: "max-bundle",
		});

		/**
		 * Listen for negotiationneeded events, and use WHIP as the signaling protocol to establish a connection
		 *
		 * https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/negotiationneeded_event
		 * https://www.ietf.org/archive/id/draft-ietf-wish-whip-01.html
		 */
		this.peerConnection.addEventListener("negotiationneeded", async (ev) => {
			console.log("Connection negotiation starting");
			await negotiateConnectionWithClientOffer(
				this.peerConnection,
				this.endpoint
			);
			console.log("Connection negotiation ended");
		});

		/**
		 * While the connection is being initialized,
		 * connect the video stream to the provided <video> element.
		 */
		this.accessLocalMediaSources()
			.then((stream) => {
				this.localStream = stream;
				videoElement.srcObject = stream;
			})
			.catch(console.error);
	}

	/**
	 * Ask for camera and microphone permissions and
	 * add video and audio tracks to the peerConnection.
	 *
	 * https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
	 */
	private async accessLocalMediaSources() {
		return navigator.mediaDevices
			.getUserMedia({ video: true, audio: true })
			.then((stream) => {
				stream.getTracks().forEach((track) => {
					const transceiver = this.peerConnection.addTransceiver(track, {
						/** WHIP is only for sending streaming media */
						direction: "sendonly",
					});
					if (track.kind == "video" && transceiver.sender.track) {
						transceiver.sender.track.applyConstraints({
							width: 1280,
							height: 720,
						});
					}
				});
				return stream;
			});
	}

	/**
	 * Terminate the streaming session
	 * 1. Notify the WHIP server by sending a DELETE request
	 * 2. Close the WebRTC connection
	 * 3. Stop using the local camera and microphone
	 *
	 * Note that once you call this method, this instance of this WHIPClient cannot be reused.
	 */
	public async disconnectStream() {
		const response = await fetch(this.endpoint, {
			method: "DELETE",
			mode: "cors",
		});
		this.peerConnection.close();
		this.localStream?.getTracks().forEach((track) => track.stop());
	}
}
