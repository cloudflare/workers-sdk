module.exports = {
	devServer: {
		hot: false,
		inline: false,
	},
	style: {
		postcssOptions: {
			plugins: [require('tailwindcss'), require('autoprefixer')],
		},
	},
};
