import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';
import { getStockandNameFromCSV } from './parsecsv2.js';

puppeteer.use(StealthPlugin());

const wpApiUrl = 'https://profitbooking.in/wp-json/scraper/v1/stockedge-sector';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function scrapeStockFeeds() {
  console.log('Starting browser...');
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    timeout: 0,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--disable-extensions',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080'
    ],
    ignoreHTTPSErrors: true,
  });

  const page = await browser.newPage();

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  );

  await page.setExtraHTTPHeaders({
    'accept-language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
  });

  const stocks = await getStockandNameFromCSV();

  const allResults = [];

  try {
    await page.goto('https://web.stockedge.com/share/dr-lal-pathlabs/15890?section=feeds', {
      waitUntil: 'networkidle2',
      timeout: 180000
    });

    await delay(5000);

    for (const { stockName, stock } of stocks) {
      try {
        console.log(`Searching for stock: ${stock}`);
        await delay(3000);

        await page.waitForSelector('input.searchbar-input', { timeout: 60000 });
        await page.click('input.searchbar-input');
        await delay(1000);

        await page.evaluate(() => {
          document.querySelector('input.searchbar-input').value = '';
        });
        await delay(1000);

        for (const char of stock) {
          await page.type('input.searchbar-input', char, { delay: 100 });
        }

        await delay(3000);
        await page.waitForSelector('ion-item[button]', { timeout: 60000 });
        await delay(2000);

        const clickedResult = await page.evaluate(() => {
          const stockItems = Array.from(document.querySelectorAll('ion-item[button]'));
          for (const item of stockItems) {
            const labelText = item.querySelector('ion-label')?.textContent || '';
            const chipText = item.querySelector('ion-chip ion-label')?.textContent || '';
            if (chipText.includes('Stock')) {
              item.click();
              return labelText;
            }
          }
          return null;
        });

        if (!clickedResult) {
          console.log(`No matching stock found for: ${stock}`);
          continue;
        }

        console.log(`Clicked on stock: ${clickedResult}`);

        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
        await delay(8000);

        const currentUrl = page.url();
        console.log(`Navigated to: ${currentUrl}`);

        if (!currentUrl.includes('section=overview')) {
          const overviewUrl = `${currentUrl.split('?')[0]}?section=overview`;
          console.log(`Navigating to overview section: ${overviewUrl}`);
          await page.goto(overviewUrl, { waitUntil: 'networkidle2', timeout: 60000 });
          await delay(5000);
        }

        console.log('Waiting for items to load...');

        const data = await page.evaluate(() => {
          let sector = null;
          let industry = null;
          let category = null;
          const cols = document.querySelectorAll('ion-col');

          cols.forEach(col => {
            const labelElement = col.querySelector('ion-text[color="se-grey-medium"]');
            const valueElement = col.querySelector('ion-text[color="se"], ion-text[color="se-grey"]');

            if (labelElement && valueElement) {
              const label = labelElement.textContent.trim().toLowerCase();
              const value = valueElement.textContent.trim();

              if (label === 'sector') sector = value;
              if (label === 'industry') industry = value;
              if (label === 'category') category = value;
            }
          });

          return { sector, industry, category };
        });

        data.stock = stock;
        data.stockName = stockName;
        console.log(`Extracted for ${stock}:`);
        console.log(data);


        const result = await storeInWordPress(data);
        allResults.push(result);

      } catch (err) {
        console.error(`Error processing stock ${stock}:`, err);
        continue;
      }
    }

  } catch (err) {
    console.error('Error during browser interaction:', err);
  } finally {
    console.log("Waiting 10 seconds before closing the browser...");
    await delay(10000);
    await browser.close();
    console.log('Browser closed.');
  }

  return allResults;
}

async function storeInWordPress(data) {
  try {
    console.log('Sending to WordPress API...');
    const response = await axios.post(wpApiUrl, {
      sector: data.sector,
      industry: data.industry,
      category: data.category,
      stock: data.stock,
      stockName: data.stockName,
    });

    console.log('WordPress API response:', response.data);
    return response.data?.duplicate ? { duplicate: true } : true;
  } catch (error) {
    console.error('WP API Error:', error.response?.data || error.message);
    return false;
  }
}

async function feed() {
  try {
    const scrapedData = await scrapeStockFeeds();
    console.log('Scraping complete. All feed data has been stored in WordPress.');
  } catch (error) {
    console.error('Scraping failed:', error);
  }
}

feed();
