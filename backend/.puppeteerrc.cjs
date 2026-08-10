const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Changes the cache location for Puppeteer to a directory inside the project
  // This ensures browser downloaded during build is preserved in the deployed artifact on Render
  cacheDirectory: join(__dirname, '.puppeteer-cache'),
};
