const puppeteer = require('puppeteer-core');
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// Cari path Chrome di berbagai environment
function getChromePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  // Untuk Railway, Ubuntu
  const possiblePaths = [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    process.env.CHROME_PATH
  ];
  return possiblePaths.find(p => require('fs').existsSync(p)) || null;
}

async function processClaim(userId, ticketCode, manualBetting = null) {
  let browser;
  try {
    const chromePath = getChromePath();
    if (!chromePath) throw new Error('Chrome tidak ditemukan. Pastikan sudah install di Railway.');
    
    browser = await puppeteer.launch({ 
      executablePath: chromePath,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    
    // ========== STEP 1: Buka bandar80 & cari scatter ==========
    await page.goto('https://bandar80.idrbo2.com/transaction-record.html', { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Isi User ID
    await page.waitForSelector('xpath/html/body/div[2]/div[3]/form/div/ul/li[1]/input', { timeout: 10000 });
    await page.$eval('xpath/html/body/div[2]/div[3]/form/div/ul/li[1]/input', (el, val) => el.value = val, userId);
    
    // Isi Kode Tiket
    await page.$eval('xpath/html/body/div[2]/div[3]/form/div/ul/li[7]/input', (el, val) => el.value = val, ticketCode);
    
    // Klik tombol cari (a[1])
    await page.click('xpath/html/body/div[2]/div[3]/form/div/div/a[1]');
    await wait(2000);
    
    // Klik tab "Detail"
    await page.click('xpath/html/body/div[2]/div[3]/div[2]/ul/li[2]/a');
    await wait(1500);
    
    // Klik link detail transaksi pertama
    await page.click('xpath/html/body/div[2]/div[3]/div[4]/div/table/tbody/tr[1]/td[5]/a');
    await wait(3000);
    
    // Pindah ke tab baru (public.zmcyu9ypy.com)
    const pages = await browser.pages();
    let detailPage = pages[pages.length - 1];
    await detailPage.waitForSelector('xpath/html/body/div/div/div[1]/div[2]/div[2]', { timeout: 20000 });
    
    // Cek keberadaan simbol scatter
    let scatterValue = '0';
    const scatterSymbol = await detailPage.$('xpath/html/body/div/div/section/div[1]/div[4]/div[2]/div[4]/div/div[1]/div');
    if (scatterSymbol) {
      const scatterText = await detailPage.$eval('xpath/html/body/div/div/section/div[1]/div[4]/div[2]/div[4]/div/div[2]/div', el => el.innerText);
      const match = scatterText.match(/(\d+)/);
      scatterValue = match ? match[1] : '0';
    } else {
      // Coba klik next (a[2]/div) sampai ketemu maksimal 5x
      for (let i = 0; i < 5; i++) {
        const nextBtn = await detailPage.$('xpath/html/body/div/div/div[2]/a[2]/div');
        if (!nextBtn) break;
        await nextBtn.click();
        await wait(1500);
        const newSymbol = await detailPage.$('xpath/html/body/div/div/section/div[1]/div[4]/div[2]/div[4]/div/div[1]/div');
        if (newSymbol) {
          const txt = await detailPage.$eval('xpath/html/body/div/div/section/div[1]/div[4]/div[2]/div[4]/div/div[2]/div', el => el.innerText);
          const m = txt.match(/(\d+)/);
          scatterValue = m ? m[1] : '0';
          break;
        }
      }
    }
    
    // Ambil betting (manual atau otomatis)
    let betting = manualBetting;
    if (!betting) {
      try {
        const bettingElem = await detailPage.$('xpath/html/body/div/div/section/div[1]/div[4]/div[2]/div[2]/div/div[2]');
        if (bettingElem) betting = await bettingElem.evaluate(el => el.innerText.replace(/[^0-9]/g, ''));
        else betting = '0';
      } catch(e) { betting = '0'; }
    }
    
    // ========== STEP 2: Buka bonussmb & submit klaim ==========
    await detailPage.close();
    const bonusPage = await browser.newPage();
    await bonusPage.goto('https://bonussmb.com/', { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Klik menu klaim (li[1]/a/span)
    await bonusPage.click('xpath/html/body/div/div/div/div[2]/div/div[2]/div[1]/div[1]/div/div/ul/li[1]/a/span');
    await wait(1000);
    
    // Klik tombol tambah
    await bonusPage.click('xpath/html/body/div[1]/div/main/div/div[1]/button');
    await wait(800);
    
    // Pilih "Livechat" (dropdown pertama)
    await bonusPage.click('xpath/html/body/div[3]/div[2]/form/div[1]/div[2]/div/div');
    await wait(500);
    await bonusPage.click('xpath/html/body/div[3]/div[2]/form/div[1]/div[2]/div/div/div[1]/div[1]');
    
    // Pilih "Marketing" (dropdown kedua)
    await bonusPage.click('xpath/html/body/div[3]/div[2]/form/div[2]/div[2]/div/div');
    await wait(500);
    await bonusPage.click('xpath/html/body/div[3]/div[2]/form/div[2]/div[2]/div/div/div[1]/div[2]/input');
    
    // Isi User ID
    await bonusPage.$eval('xpath/html/body/div[3]/div[2]/form/div[4]/div[2]/input', (el, val) => el.value = val, userId);
    
    // Isi Kode Tiket
    await bonusPage.$eval('xpath/html/body/div[3]/div[2]/form/div[5]/div[2]/input', (el, val) => el.value = val, ticketCode);
    
    // Isi keterangan "-"
    await bonusPage.$eval('xpath/html/body/div[3]/div[2]/form/div[6]/div[2]/textarea', el => el.value = '-');
    
    // Isi Betting
    await bonusPage.$eval('xpath/html/body/div[3]/div[2]/form/div[7]/div[2]/input', (el, val) => el.value = val, betting);
    
    // Isi Scatter
    await bonusPage.$eval('xpath/html/body/div[3]/div[2]/form/div[8]/div[2]', (el, val) => el.value = val, scatterValue);
    
    // Klik simpan
    await bonusPage.click('xpath/html/body/div[3]/div[3]/button');
    await wait(2000);
    
    // Cek error notifikasi
    let errorMsg = null;
    const duplicateElem = await bonusPage.$('xpath/html/body/div[3]/div[2]/form/div[5]/div[2]/p');
    if (duplicateElem) {
      const text = await duplicateElem.evaluate(el => el.innerText);
      if (text.includes('already been taken')) errorMsg = 'Kode tiket sudah pernah di claim';
    }
    const limitNotif = await bonusPage.$('xpath/html/body/div[1]/div');
    if (limitNotif) {
      const limitText = await limitNotif.evaluate(el => el.innerText);
      if (limitText.includes('Maksimal total klaim hanya 4')) errorMsg = 'Sudah melebihi max claim';
    }
    
    await browser.close();
    if (errorMsg) return { success: false, error: errorMsg, betting, scatter: scatterValue };
    return { success: true, betting, scatter: scatterValue, status: 'PENDING' };
    
  } catch (err) {
    if (browser) await browser.close();
    console.error('Automation error:', err);
    return { success: false, error: err.message };
  }
}

async function checkPendingStatus(ticketCode) {
  let browser;
  try {
    const chromePath = getChromePath();
    if (!chromePath) throw new Error('Chrome tidak ditemukan');
    browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto('https://bonussmb.com/', { waitUntil: 'networkidle2' });
    
    // Klik menu history (li[2]/a)
    await page.click('xpath/html/body/div/div/div/div[2]/div/div[2]/div[1]/div[1]/div/div/ul/li[2]/a');
    await wait(1500);
    
    // Input kode tiket di search
    await page.$eval('xpath/html/body/div/div/main/div/div[3]/div[1]/div[1]/input', (el, val) => el.value = val, ticketCode);
    await wait(1000);
    
    // Ambil status dari td[9]/div
    const statusElem = await page.$('xpath/html/body/div/div/main/div/div[3]/div[2]/div/table/tbody/tr[1]/td[9]/div');
    if (!statusElem) return { status: 'PENDING', remark: '' };
    let status = await statusElem.evaluate(el => el.innerText.trim());
    let remark = '';
    if (status === 'REJECTED') {
      const remarkElem = await page.$('xpath/html/body/div/div/main/div/div[3]/div[2]/div/table/tbody/tr/td[10]');
      if (remarkElem) remark = await remarkElem.evaluate(el => el.innerText.trim());
    }
    await browser.close();
    return { status: status === 'APPROVED' ? 'APPROVED' : (status === 'REJECTED' ? 'REJECTED' : 'PENDING'), remark };
  } catch(e) {
    if (browser) await browser.close();
    return { status: 'PENDING', remark: '' };
  }
}

module.exports = { processClaim, checkPendingStatus };