// End-to-end browser test: MVC site + form-builder-api + MySQL 8.0, driven through Microsoft Edge.
//   Start MySQL, the API (http://localhost:5080) and the MVC site (http://localhost:5090), then:
//   npm install && npm test
// Environment: MVC_URL, API_URL, BROWSER_CHANNEL (msedge | chrome), SCREENSHOTS (folder to save pages to)
const { chromium } = require('playwright-core');
const path = require('path');

const MVC = process.env.MVC_URL || 'http://localhost:5090';
const API = process.env.API_URL || 'http://localhost:5080';
const SHOTS = process.env.SCREENSHOTS || path.join(__dirname, '..', '..', 'docs', 'screenshots');

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

// ---- direct API calls, used to look at what is really stored ----
async function apiToken() {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@12345' })
  });
  return (await r.json()).accessToken;
}
async function apiGet(token, url) {
  const r = await fetch(`${API}${url}`, { headers: { Authorization: `Bearer ${token}` } });
  return r.json();
}

// ---- browser helpers ----
async function login(page, user, pass) {
  await page.goto(`${MVC}/Account/Login`);
  await page.fill('#Username', user);
  await page.fill('#Password', pass);
  await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/Account/Login')), page.click('form button.btn-primary')]);
}
async function logout(page) {
  await page.click('.user-chip');
  await Promise.all([page.waitForURL(/Account\/Login/), page.click('text=Sign out')]);
}
/** Waits for debounced edits and their AJAX calls to finish. */
async function settle(page) {
  await page.waitForTimeout(600);
  await page.waitForLoadState('networkidle');
}
/** Drags with real mouse moves so jQuery UI sees the gesture. */
async function drag(page, from, to) {
  const a = await from.boundingBox(), b = await to.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++)
    await page.mouse.move(a.x + (b.x + b.width / 2 - a.x) * i / 12, a.y + (b.y + b.height / 2 - a.y) * i / 12);
  await page.mouse.up();
}

(async () => {
  const token = await apiToken();
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));

  // ---------- sign-in ----------
  await page.goto(`${MVC}/`);
  check('anonymous visit redirects to the login page', page.url().includes('/Account/Login'));
  await page.screenshot({ path: path.join(SHOTS, 'login.png') });

  await page.fill('#Username', 'admin');
  await page.fill('#Password', 'wrong');
  await page.click('form button.btn-primary');
  check('wrong password shows an error', (await page.textContent('.validation-summary-errors')).includes('Invalid username or password'));

  await login(page, 'admin', 'Admin@12345');
  check('admin (level 100) signs in and can create forms', await page.isVisible('text=+ New form'));
  const formsBefore = (await apiGet(token, '/api/forms')).length;

  // ---------- builder ----------
  await page.click('.page-head >> text=+ New form');
  await page.waitForSelector('#canvas .canvas-field');
  check('a new draft starts with one field', await page.locator('#canvas .canvas-field').count() === 1);

  await page.fill('#form-name', 'Developer Meetup Registration');
  await page.fill('#form-description', 'Reserve your seat for the monthly .NET meetup.');
  await settle(page);

  await page.click('#canvas .canvas-field >> nth=0');
  await page.fill('[data-prop=label]', 'Full name');
  await page.check('[data-prop=required]');
  await page.fill('[data-prop=min]', '2');
  await page.fill('[data-prop=max]', '80');
  await page.fill('[data-prop=placeholder]', 'Jane Doe');
  await settle(page);
  check('the key follows the label', (await page.inputValue('[data-prop=key]')) === 'full_name');

  await drag(page, page.locator('#palette [data-type=Email]'), page.locator('#canvas'));
  await settle(page);
  check('dragging from the palette adds a field', await page.locator('#canvas .canvas-field').count() === 2);
  await page.fill('[data-prop=label]', 'Email');
  await page.check('[data-prop=required]');
  await settle(page);

  await page.click('#palette [data-type=Select]'); await settle(page);
  await page.fill('[data-prop=label]', 'Preferred track');
  await page.fill('[data-prop=options]', 'Backend\nFrontend\nDevOps');
  await page.check('[data-prop=required]');
  await settle(page);
  await page.click('#palette [data-type=Number]'); await settle(page);
  await page.fill('[data-prop=label]', 'Years of experience');
  await page.fill('[data-prop=min]', '0');
  await page.fill('[data-prop=max]', '50');
  await settle(page);
  await page.click('#palette [data-type=Checkbox]'); await settle(page);
  await page.fill('[data-prop=label]', 'I agree to be contacted about this event');
  await page.check('[data-prop=required]');
  await settle(page);

  await drag(page, page.locator('#canvas .canvas-field >> nth=3 >> .handle'), page.locator('#canvas .canvas-field >> nth=2'));
  await settle(page);
  const order = await page.locator('#canvas .canvas-field strong').allTextContents();
  check('dragging the handle reorders fields', order[2].startsWith('Years of experience'), order.join(' | '));

  const formsWhileEditing = (await apiGet(token, '/api/forms')).length;
  check('nothing is written to the database while editing', formsWhileEditing === formsBefore, `${formsBefore} -> ${formsWhileEditing} forms`);
  check('the builder shows unsaved changes', (await page.textContent('#draft-status')).includes('Unsaved'));

  await page.check('#form-published'); await settle(page);
  await page.click('#canvas .canvas-field >> nth=0');
  await page.screenshot({ path: path.join(SHOTS, 'builder.png') });
  await page.click('#btn-preview');
  await page.screenshot({ path: path.join(SHOTS, 'preview.png') });
  await page.click('#btn-preview');

  await page.click('#btn-save');
  await page.waitForSelector('.toast-msg >> text=saved');
  await settle(page);
  const formId = Number(new URL(page.url()).pathname.split('/').pop());
  const saved = await apiGet(token, `/api/forms/${formId}`);
  check('Save writes the form once', (await apiGet(token, '/api/forms')).length === formsBefore + 1);
  check('the stored design is complete', saved.fields.length === 5 && saved.isPublished === true, `${saved.fields.length} fields, published=${saved.isPublished}`);
  await logout(page);

  // ---------- level 10 user ----------
  await login(page, 'user', 'User@12345');
  check('level 10 user does not see "New form"', !(await page.isVisible('text=+ New form')));
  await page.goto(`${MVC}/Forms/Builder`);
  check('level 10 user is denied the builder', page.url().includes('/Account/AccessDenied'));
  await page.screenshot({ path: path.join(SHOTS, 'access-denied.png') });

  await page.goto(`${MVC}/Forms/Fill/${formId}`);
  await page.waitForSelector('.sheet .field');
  await page.click('.sheet button[type=submit]');
  const errors = await page.locator('[data-error-for]:not(:empty)').count();
  check('an empty submit shows field errors', errors >= 4, `${errors} errors`);

  await page.fill('[name=full_name]', 'Mir Wasim');
  await page.fill('[name=email]', 'Wasim@Example.com');
  await page.fill('[name=years_of_experience]', '3');
  await page.selectOption('[name=preferred_track]', 'Backend');
  await page.check('[name=i_agree_to_be_contacted_about_this_event]');
  await page.screenshot({ path: path.join(SHOTS, 'fill.png') });
  await page.click('.sheet button[type=submit]');
  await page.waitForSelector('text=Thank you!');
  const stored = (await apiGet(token, `/api/forms/${formId}/submissions`))[0];
  check('the submission is stored, normalised', stored && stored.answers.email === 'wasim@example.com', stored && stored.answers.email);
  await logout(page);

  // ---------- submissions ----------
  await login(page, 'admin', 'Admin@12345');
  await page.goto(`${MVC}/Forms/Submissions/${formId}`);
  await page.waitForSelector('table tbody tr');
  check('admin sees the submission', (await page.textContent('table tbody')).includes('Mir Wasim'));
  await page.screenshot({ path: path.join(SHOTS, 'submissions.png') });
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export')]);
  check('CSV export downloads', download.suggestedFilename().endsWith('.csv'), download.suggestedFilename());

  check('no JavaScript errors', jsErrors.length === 0, jsErrors.join(' | '));
  await browser.close();

  const failed = results.filter(ok => !ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
