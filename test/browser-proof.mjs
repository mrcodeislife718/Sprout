import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(process.cwd());
const html = `<!doctype html><html><body><div id="app"><button role="button" aria-disabled="false" data-count="0">Count 0</button></div><script type="module">
import { h, signal, render, hydrate, a11y } from '/src/index.js';
try {
  const count = signal(0);
  const view = () => h('button', { ...a11y.button(), 'aria-disabled':'false', 'data-count':String(count.value), onClick:() => { count.value++; render(view(), document.getElementById('app')); } }, 'Count ' + count.value);
  const app = document.getElementById('app');
  const result = hydrate(view(), app, { state:{ count:0 } });
  window.__hydratedButton = document.querySelector('button');
  window.__proof = { matched:result.matched, hydrated:app.dataset.sproutHydrated };
} catch (error) {
  window.__proofError = { name:error?.name ?? 'Error', message:error?.message ?? String(error), stack:error?.stack ?? null };
}
</script></body></html>`;

const server = http.createServer(async (req,res) => {
  try {
    if (req.url === '/' || req.url === '/proof.html') { res.setHeader('content-type','text/html'); res.end(html); return; }
    const relative = decodeURIComponent((req.url ?? '/').split('?')[0].replace(/^\//,''));
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) throw new Error('path escape');
    const data = await fs.readFile(file);
    if (file.endsWith('.js')) res.setHeader('content-type','text/javascript');
    res.end(data);
  } catch { res.statusCode=404; res.end('not found'); }
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const address = server.address();
const browser = await chromium.launch({ headless:true });
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push({ name:error.name, message:error.message, stack:error.stack }));
  await page.goto(`http://127.0.0.1:${address.port}/proof.html`);
  await page.waitForFunction(() => window.__proof?.hydrated === 'true' || window.__proofError, null, { timeout:5000 }).catch(async (error) => {
    const state = await page.evaluate(() => ({ proof:window.__proof ?? null, proofError:window.__proofError ?? null, html:document.documentElement.outerHTML }));
    throw new Error(`Sprout browser initialization failed: ${JSON.stringify({ state, pageErrors })}`, { cause:error });
  });
  const initializationError = await page.evaluate(() => window.__proofError ?? null);
  if (initializationError || pageErrors.length) throw new Error(`Sprout browser module failed: ${JSON.stringify({ initializationError, pageErrors })}`);
  const initial = await page.evaluate(() => ({ proof:window.__proof, text:document.querySelector('button').textContent, role:document.querySelector('button').getAttribute('role'), tabIndex:document.querySelector('button').tabIndex, sameHydratedNode:window.__hydratedButton===document.querySelector('button') }));
  if (!initial.proof.matched) throw new Error('SSR markup failed hydration match');
  if (!initial.sameHydratedNode || initial.text !== 'Count 0' || initial.role !== 'button' || initial.tabIndex !== 0) throw new Error(`invalid initial browser state: ${JSON.stringify(initial)}`);
  await page.click('button');
  await page.waitForFunction(() => document.querySelector('button')?.textContent === 'Count 1');
  const after = await page.evaluate(() => ({ text:document.querySelector('button').textContent, count:document.querySelector('button').getAttribute('data-count'), role:document.querySelector('button').getAttribute('role'), ariaDisabled:document.querySelector('button').getAttribute('aria-disabled'), nodeIdentityPreserved:window.__hydratedButton===document.querySelector('button') }));
  if (after.text !== 'Count 1' || after.count !== '1' || after.role !== 'button' || after.ariaDisabled !== 'false' || !after.nodeIdentityPreserved) throw new Error(`browser incremental update/a11y proof failed: ${JSON.stringify(after)}`);
} finally {
  await browser.close();
  await new Promise((resolve)=>server.close(resolve));
}
