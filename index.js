import puppeteer from 'puppeteer';



async function extractSectorAndIndustry(url) {
  const browser = await puppeteer.launch({ headless: true });
  
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });
    
    const data = await page.evaluate(() => {
      let sector = null;
      let industry = null;
      let category = null;
      
      // Find all ion-col elements
      const cols = document.querySelectorAll('ion-col');
      
      cols.forEach(col => {
        const labelElement = col.querySelector('ion-text[color="se-grey-medium"]');
        const valueElement = col.querySelector('ion-text[color="se"], ion-text[color="se-grey"]');
        
        if (labelElement && valueElement) {
          const label = labelElement.textContent.trim().toLowerCase();
          const value = valueElement.textContent.trim();
          
          if (label === 'sector') {
            sector = value;
          }
          if (label === 'industry') {
            industry = value;
          }
          if (label === 'category') {
            category = value;
          }
        }
      });
      
      return { sector, industry, category };
    });
    
    return data;
    
  } finally {
    await browser.close();
  }
}


extractSectorAndIndustry('https://web.stockedge.com/share/sbi-life-insurance-company/86648?section=overview')
  .then(result => console.log(result));