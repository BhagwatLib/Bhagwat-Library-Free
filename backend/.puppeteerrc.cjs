const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Changes the cache location for Puppeteer to a directory inside the repository
  cacheDirectory: join(__dirname, '.puppeteer-cache'),
};
