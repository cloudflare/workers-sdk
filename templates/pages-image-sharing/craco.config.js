module.exports = {
	devServer: {
		hot: false,
		inline: false,
	},
	style: {
		postcss: {
			plugins: [require('tailwindcss'), require('autoprefixer')],
		},
	},
};
