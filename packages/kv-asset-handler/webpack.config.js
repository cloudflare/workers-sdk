module.exports = {
  entry: './src/index.ts',
  output: {
    filename: './bundle.js',
  },

  // Enable sourcemaps for debugging webpack's output.
  devtool: 'source-map',

  resolve: {
    // Add '.ts' as resolvable extensions.
    extensions: ['.webpack.js', '.web.js', '.ts', '.js'],
  },

  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
}
