import assert from 'node:assert/strict';
const expected = process.env.WEBSITE_COMMIT;
assert.ok(expected, 'WEBSITE_COMMIT required');
for (let attempt = 0; ; attempt++) {
 try {
  const response = await fetch('https://bytesskills.com/', {signal: AbortSignal.timeout(10000)});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Bytes-Website-Commit'), expected);
  assert.match(await response.text(), /action="\/waitlist"/);
  const api = await fetch('https://api.bytesskills.com/health', {signal: AbortSignal.timeout(10000)});
  assert.equal(api.status, 200);
  console.log('Website revision verified; API health responds successfully.');
  break;
 } catch (error) {
  if (attempt >= 11) throw error;
  await new Promise(resolve => setTimeout(resolve, 5000));
 }
}
