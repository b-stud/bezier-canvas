const path = require('path');
const debug = process.env.NODE_ENV !== "production";
const webpack = require('webpack');

const libraryName = 'BezierCanvas';

module.exports = {
    entry: './src/BezierCanvas.ts',
    devtool: debug ? "inline-sourcemap" : false,
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/
            },
            {
                test: /\.ts$/,
                enforce: 'pre',
                loader: 'tslint-loader',
                options: {
                    failOnHint: true,
                    configuration: require('./tslint.json')
                }
            }
        ]
    },
    resolve: {
        extensions: [ '.tsx', '.ts', '.js' ]
    },
    output: {
        filename: 'bezier-canvas.min.js',
        path: path.resolve(__dirname, 'dist'),
        library: libraryName,
        libraryTarget: 'umd',
        libraryExport: 'default',
        umdNamedDefine: true
    },
    plugins: debug ? [] : [
        new webpack.optimize.OccurrenceOrderPlugin(),
        new webpack.optimize.UglifyJsPlugin({ mangle: false, sourcemap: false })
    ]
};