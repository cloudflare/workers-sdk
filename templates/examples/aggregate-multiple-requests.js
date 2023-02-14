// Make multiple requests, aggregate the responses
// and send them back as a single response.
export default {
	/**
	 * @returns {Promise<Response>}
	 */
	async fetch() {
		const init = {
			method: "GET",
			headers: {
				Authorization: "XXXXXX",
				"Content-Type": "text/plain",
			},
		};

		const [btcResp, ethResp, ltcResp] = await Promise.all([
			fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot", init),
			fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", init),
			fetch("https://api.coinbase.com/v2/prices/LTC-USD/spot", init),
		]);

		const [btc, eth, ltc] = await Promise.all([
			btcResp.json(),
			ethResp.json(),
			ltcResp.json(),
		]);

		const combined = {
			btc: btc["data"].amount,
			ltc: ltc["data"].amount,
			eth: eth["data"].amount,
		};

		return new Response(JSON.stringify(combined), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
			},
		});
	},
};
