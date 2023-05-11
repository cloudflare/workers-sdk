/**
 * Performs the actual SDP exchange.
 *
 * 1. Constructs the client's SDP offer
 * 2. Sends the SDP offer to the server,
 * 3. Awaits the server's offer.
 *
 * SDP describes what kind of media we can send and how the server and client communicate.
 *
 * https://developer.mozilla.org/en-US/docs/Glossary/SDP
 * https://www.ietf.org/archive/id/draft-ietf-wish-whip-01.html#name-protocol-operation
 */
export default async function negotiateConnectionWithClientOffer(
	peerConnection: RTCPeerConnection,
	endpoint: string
) {
	/** https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createOffer */
	const offer = await peerConnection.createOffer();
	/** https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/setLocalDescription */
	await peerConnection.setLocalDescription(offer);

	/** Wait for ICE gathering to complete */
	let ofr = await waitToCompleteICEGathering(peerConnection);
	if (!ofr) {
		throw Error("failed to gather ICE candidates for offer");
	}

	/**
	 * As long as the connection is open, attempt to...
	 */
	while (peerConnection.connectionState !== "closed") {
		/**
		 * This response contains the server's SDP offer.
		 * This specifies how the client should communicate,
		 * and what kind of media client and server have negotiated to exchange.
		 */
		let response = await postSDPOffer(endpoint, ofr.sdp);
		if (response.status === 201) {
			let answerSDP = await response.text();
			await peerConnection.setRemoteDescription(
				new RTCSessionDescription({ type: "answer", sdp: answerSDP })
			);
			return response.headers.get("Location");
		} else if (response.status === 405) {
			console.log(
				"Remember to update the URL passed into the WHIP or WHEP client"
			);
		} else {
			const errorMessage = await response.text();
			console.error(errorMessage);
		}

		/** Limit reconnection attempts to at-most once every 5 seconds */
		await new Promise((r) => setTimeout(r, 5000));
	}
}

async function postSDPOffer(endpoint: string, data: string) {
	return await fetch(endpoint, {
		method: "POST",
		mode: "cors",
		headers: {
			"content-type": "application/sdp",
		},
		body: data,
	});
}

/**
 * Receives an RTCPeerConnection and waits until
 * the connection is initialized or a timeout passes.
 *
 * https://www.ietf.org/archive/id/draft-ietf-wish-whip-01.html#section-4.1
 * https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/iceGatheringState
 * https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/icegatheringstatechange_event
 */
async function waitToCompleteICEGathering(peerConnection: RTCPeerConnection) {
	return new Promise<RTCSessionDescription | null>((resolve) => {
		/** Wait at most 1 second for ICE gathering. */
		setTimeout(function () {
			resolve(peerConnection.localDescription);
		}, 1000);
		peerConnection.onicegatheringstatechange = (ev) =>
			peerConnection.iceGatheringState === "complete" &&
			resolve(peerConnection.localDescription);
	});
}
