const webpack = require('webpack');
const path = require('path');
const packageJson = require('./package.json');

const bannerComment = [
  `domo.js v${packageJson.version}`,
  'Optional utility library for Custom Apps'
].join('\n');

const config = {
  context: __dirname + '/src',

  entry: './domo.js',

  resolve: {
    modulesDirectories: ['node_modules']
  },

  output: {
    path: path.join(__dirname, 'dist'),
    publicPath: '/dist/',
    filename: 'domo.js',
    library: 'domo',
    libraryTarget: 'umd'
  },

  externals: {},

  plugins: [
    new webpack.BannerPlugin(bannerComment)
  ],
  module: {
    loaders: [{
      test: /\.js$/,
      exclude: /node_modules/,
      loader: 'babel',
      query: {
        cacheDirectory: true,
        presets: ['es2015', 'stage-1'],
        plugins: []
      }
    }]
  },

  devtool: 'source-map'
};

module.exports = config;
