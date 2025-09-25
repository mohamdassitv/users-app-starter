const path = require('path');
const { CKEditorTranslationsPlugin } = require('@ckeditor/ckeditor5-dev-translations');
const { styles } = require('@ckeditor/ckeditor5-dev-utils');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  mode: 'production',
  devtool: 'source-map',
  entry: path.resolve(__dirname, 'src', 'editor.js'),
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'ckeditor.js',
    library: 'ClassicEditor',
    libraryTarget: 'umd',
    clean: true
  },
  optimization: {
    minimizer: [ new TerserPlugin({ parallel: true }) ]
  },
  module: {
    rules: [
      {
        test: /ckeditor5-[^/\\]+[\\/].+\.js$/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [ ['@babel/preset-env', { modules: false, targets: '>0.2%, not dead' }] ]
          }
        }
      },
      {
        test: /\.(svg|css)$/,
        use: [ 'raw-loader' ]
      },
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      ...styles.getWebpackModules()
    ]
  },
  resolve: {
    extensions: ['.js', '.ts'],
    alias: {
      '@ckeditor': path.resolve(__dirname, 'node_modules', '@ckeditor')
    }
  },
  plugins: [
    new CKEditorTranslationsPlugin({
      language: 'en',
      addMainLanguageTranslationsToAllAssets: true
    })
  ]
};
