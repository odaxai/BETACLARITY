// webpack.config.js

const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

const PORT = parseInt(process.env.PORT || '3000', 10);
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

module.exports = {
  mode: 'development',
  entry: './src/index.js',

  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },

  performance: {
    hints: false,
  },

  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    host: '0.0.0.0', // Allow external connections (needed for Docker)
    port: PORT,
    compress: true,
    open: false, // Don't auto-open browser in Docker
    historyApiFallback: true,
    hot: true,
    client: {
      logging: 'info',
      overlay: true,
    },
    // Proxy ALL backend API endpoints to backend container
    proxy: {
      // BetaVisionQA API endpoints
      '/api/**': {
        target: BACKEND_URL,
        secure: false,
        changeOrigin: true,
      },
      '/chat': {
        target: BACKEND_URL,
        secure: false,
        changeOrigin: true,
      },
      '/conversations': {
        target: BACKEND_URL,
        secure: false,
        changeOrigin: true,
      },
      '/conversations/**': {
        target: BACKEND_URL,
        secure: false,
        changeOrigin: true,
      },
      // BetaSR specific endpoints
      '/create_session': {
        target: BACKEND_URL,
        secure: false,
        changeOrigin: true,
      },
      '/upload_file': {
        target: BACKEND_URL,
        secure: false,
        changeOrigin: true,
      },
      '/get_sample_images': {
        target: BACKEND_URL,
        secure: false,
        changeOrigin: true,
      },
      '/get_preprocessed': {
        target: BACKEND_URL,
        secure: false,
        changeOrigin: true,
      },
      '/load_sample_image': {
        target: BACKEND_URL,
        secure: false,
        changeOrigin: true,
      },
      '/process_distortion': {
        target: BACKEND_URL,
        secure: false,
        changeOrigin: true,
      },
      '/get_distorted': {
        target: BACKEND_URL,
        secure: false,
        changeOrigin: true,
      },
      '/apply_denoising': {
        target: BACKEND_URL,
        secure: false,
        changeOrigin: true,
      },
      '/get_denoised': {
        target: BACKEND_URL,
        secure: false,
        changeOrigin: true,
      },
      '/compute_metrics': {
        target: BACKEND_URL,
        secure: false,
        changeOrigin: true,
      },
      '/export_measurement': {
        target: BACKEND_URL,
        secure: false,
        changeOrigin: true,
      },
      '/health': {
        target: BACKEND_URL,
        secure: false,
        changeOrigin: true,
      },
    },
  },

  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react'],
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.svg$/i,
        issuer: /\.[jt]sx?$/,
        use: ['@svgr/webpack'],
      },
    ],
  },

  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
    }),
    new webpack.DefinePlugin({
      'process.env': {
        'NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
        // Allow empty string to mean "same-origin" (used by the production Docker
        // image where nginx proxies API calls to the backend). Only fall back to
        // http://localhost:8001 when the variable is undefined (dev workflow).
        'REACT_APP_API_URL': JSON.stringify(
          process.env.REACT_APP_API_URL !== undefined
            ? process.env.REACT_APP_API_URL
            : 'http://localhost:8001'
        ),
      },
    }),
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer'],
    }),
  ],

  resolve: {
    extensions: ['.js', '.jsx'],
    alias: {
      // Ensure webpack can resolve the fully-specified ESM import used by axios/react-router
      'process/browser': require.resolve('process/browser.js'),
    },
    fallback: {
      "process": require.resolve("process/browser"),
      "buffer": require.resolve("buffer")
    },
  },
};