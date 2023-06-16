const qr = require('qr-image');

export default {
	async fetch(request, env, ctx) {
		if (request.method === 'POST') {
			return generateQRCode(request);
		}

		return new Response(landing, {
			headers: {
				'Content-Type': 'text/html',
			},
		});
	},
};

async function generateQRCode(request) {
	const { text } = await request.json();
	const headers = { 'Content-Type': 'image/png' };
	const qr_png = qr.imageSync(text || 'https://workers.dev');
	return new Response(qr_png, { headers });
}

const landing = `
<h1>QR Generator</h1>
<p>Click the below button to generate a new QR code. This will make a request to your Worker.</p>
<input type="text" id="text" value="https://workers.dev"></input>
<button onclick="generate()">Generate QR Code</button>
<p>Generated QR Code Image</p>
<img id="qr" src="#" />
<script>
	function generate() {
		fetch(window.location.pathname, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ text: document.querySelector("#text").value })
		})
		.then(response => response.blob())
		.then(blob => {
			const reader = new FileReader();
			reader.onloadend = function () {
				document.querySelector("#qr").src = reader.result; // Update the image source with the newly generated QR code
			}
			reader.readAsDataURL(blob);
		})
	}
</script>
`;
