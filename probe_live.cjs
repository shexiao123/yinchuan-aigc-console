const { chromium } = require('playwright');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const targets = [
  ['pages', 'https://shexiao123.github.io/yinchuan-aigc-console/'],
  ['pages-admin', 'https://shexiao123.github.io/yinchuan-aigc-console/admin.html'],
];
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  for (const [name, url] of targets) {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    const errs = [], pageErrs = [], failed = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
    page.on('pageerror', e => pageErrs.push(String(e).slice(0, 250)));
    page.on('requestfailed', r => failed.push((r.failure() || {}).errorText + ' :: ' + r.url().slice(-60)));
    let status = 'n/a';
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
      status = resp ? resp.status() : 'null';
      await page.waitForTimeout(6000);
    } catch (e) { status = 'GOTO_ERR ' + String(e).slice(0, 150); }
    let info = {};
    try {
      info = await page.evaluate(() => {
        const app = document.querySelector('#app') || document.body;
        return {
          title: document.title,
          offline: document.body.classList.contains('offline-mode'),
          appLen: (app.innerHTML || '').length,
          bodyLen: (document.body.innerText || '').trim().length,
          head: (document.body.innerText || '').trim().slice(0, 100).replace(/\s+/g, ' '),
          seedLoaded: !!window.SEED_DATA,
          offlineFn: typeof window.enableOfflineMode,
          cloudOffline: !!(window.cloud && window.cloud.__offline),
        };
      });
    } catch (e) { info = { evalErr: String(e).slice(0, 120) }; }
    console.log(JSON.stringify({ name, status, ...info, pageErrors: pageErrs.slice(0, 3), consoleErrs: errs.slice(0, 4), failed: failed.slice(0, 4) }));
    try { await page.screenshot({ path: 'chk_' + name + '.png', fullPage: false }); } catch (e) {}
    await ctx.close();
  }
  await browser.close();
})();
