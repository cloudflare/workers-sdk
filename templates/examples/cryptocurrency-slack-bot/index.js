addEventListener("fetch", (event) => {
	event.respondWith(slackWebhookHandler(event.request));
});

// SLACK_TOKEN is used to authenticate requests are from Slack.
// Keep this value secret.
let SLACK_TOKEN = "PUTYOURTOKENHERE";
let BOT_NAME = "Crypto-bot 🤖";
let REPO_URL = "https://github.com/cloudflare/templates";

let jsonHeaders = new Headers([["Content-Type", "application/json"]]);

// tickerMap is a map of "ticker" symbols and CoinMarketCap API IDs.
let tickerMap = new Map([
	["BTC", "bitcoin"],
	["ETH", "ethereum"],
	["XRP", "ripple"],
	["BCH", "bitcoin-cash"],
	["LTC", "litecoin"],
	["ADA", "cardano"],
	["NEO", "neo"],
	["XLM", "stellar"],
	["EOS", "eos"],
	["MIOTA", "iota"],
	["XMR", "monero"],
	["DASH", "dash"],
	["XEM", "nem"],
	["USDT", "tether"],
	["TRX", "tron"],
	["VEN", "vechain"],
	["ETC", "ethereum-classic"],
	["LSK", "lisk"],
	["QTUM", "qtum"],
	["OMG", "omisego"],
	["NANO", "nano"],
	["BTG", "bitcoin-gold"],
	["BNB", "binance-coin"],
	["ICX", "icon"],
	["ZEC", "zcash"],
	["DGD", "digixdao"],
	["PPT", "populous"],
	["STEEM", "steem"],
	["WAVES", "waves"],
	["BCN", "bytecoin-bcn"],
	["STRAT", "stratis"],
	["XVG", "verge"],
	["MKR", "maker"],
	["RHOC", "rchain"],
	["SNT", "status"],
	["DOGE", "dogecoin"],
	["SC", "siacoin"],
	["BTS", "bitshares"],
	["AE", "aeternity"],
	["REP", "augur"],
	["DCR", "decred"],
	["BTM", "bytom"],
	["WTC", "waltonchain"],
	["ONT", "ontology"],
	["ZIL", "zilliqa"],
	["AION", "aion"],
	["KMD", "komodo"],
	["ARDR", "ardor"],
	["ARK", "ark"],
	["CNX", "cryptonex"],
	["KCS", "kucoin-shares"],
	["MONA", "monacoin"],
	["ZRX", "0x"],
	["HSR", "hshare"],
	["ETN", "electroneum"],
	["DGB", "digibyte"],
	["GXS", "gxchain"],
	["VERI", "veritaseum"],
	["PIVX", "pivx"],
	["BAT", "basic-attention-token"],
	["FCT", "factom"],
	["SYS", "syscoin"],
	["GAS", "gas"],
	["R", "revain"],
	["DRGN", "dragonchain"],
	["GNT", "golem-network-tokens"],
	["QASH", "qash"],
	["FUN", "funfair"],
	["ETHOS", "ethos"],
	["LRC", "loopring"],
	["NAS", "nebulas-token"],
	["RDD", "reddcoin"],
	["XZC", "zcoin"],
	["IOST", "iostoken"],
	["EMC", "emercoin"],
	["KNC", "kyber-network"],
	["ELF", "aelf"],
	["KIN", "kin"],
	["SALT", "salt"],
	["GBYTE", "byteball"],
	["NCASH", "nucleus-vision"],
	["PART", "particl"],
	["MAID", "maidsafecoin"],
	["DCN", "dentacoin"],
	["NXT", "nxt"],
	["LINK", "chainlink"],
	["SMART", "smartcash"],
	["REQ", "request-network"],
	["POWR", "power-ledger"],
	["BNT", "bancor"],
	["PAY", "tenx"],
	["CND", "cindicator"],
	["NEBL", "neblio"],
	["POLY", "polymath-network"],
	["NXS", "nexus"],
	["DENT", "dent"],
	["ICN", "iconomi"],
	["ENG", "enigma-project"],
	["MNX", "minexcoin"],
	["STORJ", "storj"],
]);

/**
 * simpleResponse generates a simple JSON response
 * with the given status code and message.
 *
 * @param {Number} statusCode
 * @param {String} message
 */
function simpleResponse(statusCode, message) {
	let resp = {
		message: message,
		status: statusCode,
	};

	return new Response(JSON.stringify(resp), {
		headers: jsonHeaders,
		status: statusCode,
	});
}

/**
 * slackResponse builds a message for Slack with the given text
 * and optional attachment text
 *
 * @param {string} text - the message text to return
 * @param {string[]} [attachmentText] - the (optional) attachment text to add.
 */
function slackResponse(text, attachmentText) {
	let content = {
		response_type: "in_channel",
		text: text,
		attachments: [],
	};

	if (attachmentText.length > 0) {
		attachmentText.forEach((val) => {
			content.attachments.push({ text: val });
		});
	}

	try {
		return new Response(JSON.stringify(content), {
			headers: jsonHeaders,
			status: 200,
		});
	} catch (e) {
		return simpleResponse(
			200,
			"Sorry, I had an issue generating a response. Try again in a bit!"
		);
	}
}

/**
 * parseMessage parses the selected currency from the Slack message.
 *
 * @param {FormData} message - the message text
 * @return {string} - the currency name.
 */
function parseMessage(message) {
	// 1. Parse the message (trim command, trim whitespace, check length)
	// 2. Lookup the ticker <-> id (name) mapping
	// 3. Return the name value
	// 4. Else, just return the provided value from the message.
	try {
		let text = message.get("text").trim();
		let vals = text.split(" ");
		// Example: /slashcommand BTC EUR
		let currency = vals[0];
		let display = vals[1];

		// If we can't find the ticker => ID in our map, we
		// use the user-provided value.
		if (tickerMap.has(currency)) {
			currency = tickerMap.get(currency);
		}

		return {
			currency: currency,
			display: display,
		};
	} catch (e) {
		return null;
	}
}

/**
 * currencyRequest makes a request to the CoinMarketCap API for the
 * given currency ticker.
 * Endpoint: https://api.coinmarketcap.com/v1/ticker/{ticker}/?convert={display}
 *
 * @param {string} ticker - the crypto-currency to fetch the price for
 * @param {string} [display] - the currency to display (e.g. USD, EUR)
 * @returns {Object} - an Object containing the currency, price in USD, and price in the (optional) display currency.
 */
async function currencyRequest(currency, display) {
	let endpoint = "https://api.coinmarketcap.com/v1/ticker/";

	if (display === "") {
		display = "USD";
	}

	try {
		let resp = await fetch(
			`${endpoint}${currency}/?convert=${display}`,
			{ cf: { cacheTtl: 60 } } // Cache our responses for 60s.
		);

		let data = await resp.json();
		if (resp.status !== 200) {
			throw new Error(
				`bad status code from CoinMarketCap: HTTP ${resp.status}`
			);
		}

		let cachedResponse = false;
		if (resp.headers.get("cf-cache-status").toLowerCase() === "hit") {
			cachedResponse = true;
		}

		let reply = {
			currency: data[0].name,
			symbol: data[0].symbol,
			USD: data[0].price_usd,
			percent_change_1h: `${data[0].percent_change_1h}%`,
			percent_change_24h: `${data[0].percent_change_24h}%`,
			percent_change_7d: `${data[0].percent_change_7d}%`,
			updated: new Date(parseInt(`${data[0].last_updated}000`)).toUTCString(),
			cached: cachedResponse,
		};

		return reply;
	} catch (e) {
		throw new Error(`could not fetch the selected currency: ${e}`);
	}
}

/**
 * slackWebhookHandler handles an incoming Slack
 * webhook and generates a response.
 * @param {Request} request
 */
async function slackWebhookHandler(request) {
	// As per: https://api.slack.com/slash-commands
	// - Slash commands are outgoing webhooks (POST requests)
	// - Slack authenticates via a verification token.
	// - The webhook payload is provided as POST form data

	if (request.method != "POST") {
		return simpleResponse(
			200,
			`Hi, I'm ${BOT_NAME}, a Slack bot for fetching the latest crypto-currenncy prices. Find my source code at ${REPO_URL}`
		);
	}

	let formData;
	try {
		formData = await request.formData();
		if (formData.get("token").toString() !== SLACK_TOKEN) {
			return simpleResponse(403, "invalid Slack verification token");
		}
	} catch (e) {
		return simpleResponse(400, "could not decode POST form data");
	}

	try {
		let parsed = parseMessage(formData);
		if (parsed === null) {
			throw new Error("could not parse your message");
		}

		let reply = await currencyRequest(parsed.currency, parsed.display);

		return slackResponse(
			`Current price (${reply.currency}): 💵 $USD${reply.USD}`,
			[
				`1h Δ: ${reply.percent_change_1h} · 24h Δ: ${reply.percent_change_24h} · 7d Δ: ${reply.percent_change_7d}`,
				`Updated: ${reply.updated} | ${reply.cached}`,
			]
		);
	} catch (e) {
		return simpleResponse(
			200,
			`Sorry, I had an issue retrieving anything for that currency: ${e}`
		);
	}
}
