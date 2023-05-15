import chalk from "chalk";

const { white, gray, dim, hidden, bold } = chalk;

const brandColor = chalk.hex("#BD5B08");

const black = chalk.hex("#111");
const blue = chalk.hex("#0E838F");
const bgBlue = black.bgHex("#0E838F");
const red = chalk.hex("#AB2526");
const bgRed = black.bgHex("#AB2526");
const green = chalk.hex("#218529");
const bgGreen = black.bgHex("#218529");
const yellow = chalk.hex("#7F7322");
const bgYellow = black.bgHex("#7F7322");

export {
	blue,
	bgBlue,
	green,
	bgGreen,
	red,
	bgRed,
	yellow,
	bgYellow,
	brandColor,
	dim,
	white,
	gray,
	hidden,
	bold,
};
