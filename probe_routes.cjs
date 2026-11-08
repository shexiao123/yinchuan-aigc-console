const { chromium } = require('playwright');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'https://shexiao123.github.io/yinchuan-aigc-console/';
const routes = [
  '#/', '#/services', '#/service/1', '#/hall', '#/merchants', '#/merchant/1',
  '#/tasks', '#/task/1', '#/membership', '#/orders', '#/groups', '#/support',
  '#/profile', '#/notifications', '#/studio/1', '#/provider/1',
  '#/merchant-join', '#/merchant-console', '#/admin', '#/order-create/1',
];
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const pageErrs = [];
  page.on('pageerror', e => pageErrs.push(String(e).slice(0, 180)));
  await ctx.route('**workbuddy.host/**', r => r.abort());
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(4000);
  for (const h of routes) {
    pageErrs.length = 0;
    await page.evaluate((hh) => { location.hash = hh; }, h);
    await page.waitForTimeout(1800);
    const r = await page.evaluate(() => {
      const app = document.querySelector('#app') || document.body;
      const txt = (document.body.innerText || '').trim().replace(/\s+/g, ' ');
      return { len: app.innerHTML.length, head: txt.slice(0, 70) };
    });
    console.log(JSON.stringify({ route: h, appLen: r.len, head: r.head, errs: pageErrs.slice(0, 1) }));
  }
  await browser.close();
})();
