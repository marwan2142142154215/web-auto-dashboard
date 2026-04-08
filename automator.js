const puppeteer = require('puppeteer-core');
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function getChromePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const fs = require('fs');
  const paths = ['/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/chromium'];
  for (const p of paths) if (fs.existsSync(p)) return p;
  return null;
}

async function processClaim(userId, ticketCode, manualBetting = null) {
  let browser;
  try {
    const chromePath = getChromePath();
    if (!chromePath) throw new Error('Chrome tidak ditemukan. Tambahkan env PUPPETEER_EXECUTABLE_PATH');
    browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();

    // STEP 1: Buka bandar80
    await page.goto('https://bandar80.idrbo2.com/transaction-record.html', { waitUntil: 'networkidle2', timeout: 30000 });
    await page.type('input[placeholder*="User ID"], input[name*="user"]', userId);
    await page.type('input[placeholder*="Ticket"], input[name*="ticket"]', ticketCode);
    await page.click('button[type="submit"], a:contains("Cari")');
    await wait(2000);
    await page.click('a:contains("Detail")');
    await wait(1500);
    await page.click('table tbody tr:first-child td:last-child a');
    await wait(3000);

    const pages = await browser.pages();
    let detailPage = pages[pages.length - 1];
    await detailPage.waitForSelector('body', { timeout: 15000 });

    // Ambil scatter (cari teks "Scatter" diikuti angka)
    let scatterValue = '0';
    const content = await detailPage.content();
    const scatterMatch = content.match(/[Ss]catter\s*[:=]?\s*(\d+)/);
    if (scatterMatch) scatterValue = scatterMatch[1];

    let betting = manualBetting;
    if (!betting) {
      const betMatch = content.match(/[Bb]et\s*[:=]?\s*([\d.,]+)/);
      betting = betMatch ? betMatch[1].replace(/[^0-9]/g, '') : '0';
    }

    // STEP 2: Buka bonussmb
    await detailPage.close();
    const bonusPage = await browser.newPage();
    await bonusPage.goto('https://bonussmb.com/', { waitUntil: 'networkidle2' });
    await bonusPage.click('a:contains("Klaim"), span:contains("Klaim")');
    await wait(1000);
    await bonusPage.click('button:contains("Tambah"), .add-button');
    await wait(800);
    await bonusPage.type('input[name="user_id"], input[placeholder*="User ID"]', userId);
    await bonusPage.type('input[name="ticket_code"], input[placeholder*="Ticket"]', ticketCode);
    await bonusPage.type('textarea', '-');
    await bonusPage.type('input[name="betting"]', betting);
    await bonusPage.type('input[name="scatter"]', scatterValue);
    await bonusPage.click('button[type="submit"]');
    await wait(2000);

    const finalHtml = await bonusPage.content();
    if (finalHtml.includes('already been taken')) throw new Error('Kode tiket sudah pernah di claim');
    if (finalHtml.includes('Maksimal total klaim hanya 4')) throw new Error('Sudah melebihi max claim');

    await browser.close();
    return { success: true, betting, scatter: scatterValue };
  } catch (err) {
    if (browser) await browser.close();
    return { success: false, error: err.message };
  }
}

async function checkPendingStatus(ticketCode) {
  let browser;
  try {
    const chromePath = getChromePath();
    if (!chromePath) return { status: 'PENDING', remark: '' };
    browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto('https://bonussmb.com/', { waitUntil: 'networkidle2' });
    await page.click('a:contains("History"), a:contains("Riwayat")');
    await wait(1500);
    await page.type('input[placeholder*="Cari"]', ticketCode);
    await wait(1000);
    const statusElem = await page.$('td:contains("APPROVED"), td:contains("REJECTED")');
    let status = 'PENDING', remark = '';
    if (statusElem) {
      const text = await statusElem.evaluate(el => el.innerText);
      if (text.includes('APPROVED')) status = 'APPROVED';
      else if (text.includes('REJECTED')) {
        status = 'REJECTED';
        const remarkElem = await page.$('td:contains("REJECTED") + td');
        if (remarkElem) remark = await remarkElem.evaluate(el => el.innerText);
      }
    }
    await browser.close();
    return { status, remark };
  } catch(e) {
    if (browser) await browser.close();
    return { status: 'PENDING', remark: '' };
  }
}

module.exports = { processClaim, checkPendingStatus };
