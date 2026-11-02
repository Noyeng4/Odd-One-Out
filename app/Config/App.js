const path = require('node:path');

const rootDirectory = path.resolve(__dirname, '../..');

module.exports = Object.freeze({
  port: process.env.PORT || 3000,
  publicDirectory: path.join(rootDirectory, 'public'),
  indexView: path.join(__dirname, '../Views/index.html'),
});
