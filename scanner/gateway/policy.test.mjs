import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicAddress, validateTarget, resolveTarget, pinnedDestination, snapshotResolver } from './policy.mjs';
const allowed = ['example.com'];

test('private, local, reserved, mapped, and transition addresses are denied', () => {
  for (const address of ['127.0.0.1','0.0.0.0','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','192.0.2.1','198.18.0.1','224.0.0.1','255.255.255.255','::','::1','fc00::1','fe80::1','::ffff:127.0.0.1','::192.168.1.1','64:ff9b::7f00:1','2001:db8::1','2002:7f00:1::','not-an-ip']) assert.equal(publicAddress(address), null, address);
  assert.deepEqual(publicAddress('93.184.216.34'), {address:'93.184.216.34',family:4});
  assert.equal(publicAddress('2606:4700:4700::1111')?.family, 6);
});
test('URL validation rejects credentials, deceptive hosts, nonstandard ports, schemes, and numeric loopback variants', () => {
  for (const url of ['file:///etc/passwd','ftp://example.com/','http://example.com:8080','https://user:pass@example.com/','http://example.com.attacker.invalid/','http://example.com./','http://127.0.0.1/','http://2130706433/','http://0x7f000001/','http://[::ffff:127.0.0.1]/','https://example.com/#fragment','https://example.com/\r\n']) assert.throws(() => validateTarget(url,allowed), undefined, url);
  assert.equal(validateTarget('https://example.com/',allowed).host, 'example.com');
});
test('CONNECT allows only exact allowlisted authorities on port 443', () => {
  assert.equal(validateTarget('example.com:443', allowed, true).port,443);
  for (const authority of ['example.com:22','localhost:443','127.0.0.1:443','example.com:443@127.0.0.1','example.com:443/path','example.com:443#x','example.com:443\r\n']) assert.throws(() => validateTarget(authority,allowed,true));
});
test('all DNS answers must be public, and bad hosts are rejected before DNS', async () => {
  for (const answers of [[],[{address:'127.0.0.1'}],[{address:'93.184.216.34'},{address:'10.0.0.1'}],[{address:'::ffff:169.254.169.254'}]]) {
    await assert.rejects(resolveTarget('https://example.com/',allowed,false,async()=>answers));
  }
  let lookedUp=false;
  await assert.rejects(resolveTarget('http://localhost/',allowed,false,async()=>{lookedUp=true;return [];}));
  assert.equal(lookedUp,false);
});
test('connections use the validated numeric address without a second hostname lookup', async () => {
  let count=0;
  const resolver=async()=>[{address:++count===1?'93.184.216.34':'127.0.0.1'}];
  const first=await resolveTarget('https://example.com/',allowed,false,resolver);
  assert.deepEqual(pinnedDestination(first), {host:'93.184.216.34',family:4,port:443});
  assert.equal(count,1);
  await assert.rejects(resolveTarget('https://example.com/',allowed,false,resolver));
  assert.throws(()=>pinnedDestination({...first,address:'127.0.0.1'}));
});
test('redirects and subresource destinations receive the same policy as the first URL', async () => {
  const publicResolver=async()=>[{address:'93.184.216.34'}];
  await resolveTarget('http://example.com/',allowed,false,publicResolver);
  for (const next of ['http://169.254.169.254/latest/meta-data/','http://10.0.0.1/script.js','https://unlisted.invalid/style.css']) await assert.rejects(resolveTarget(next,allowed,false,publicResolver));
});

test('frozen snapshots fail closed without DNS and cannot be changed by later input mutation', async () => {
  const input = { 'example.com': ['93.184.216.34'] };
  const lookup = snapshotResolver(input, allowed);
  input['example.com'][0] = '127.0.0.1';
  const first = await lookup('example.com'); first[0].address = '127.0.0.1';
  assert.equal((await lookup('example.com'))[0].address, '93.184.216.34');
  await assert.rejects(lookup('localhost'));
  await assert.rejects(snapshotResolver({}, allowed)('example.com'));
});
test('frozen snapshots reject private, IPv6, malformed, or unapproved destinations', () => {
  for (const value of [null, [], { localhost: ['93.184.216.34'] }, { 'example.com': ['127.0.0.1'] },
    { 'example.com': ['::1'] }, { 'example.com': ['2606:4700:4700::1111'] }, { 'example.com': ['93.184.216.34', '10.0.0.1'] },
    { 'example.com': [] }, JSON.parse('{"__proto__":["93.184.216.34"]}')]) assert.throws(() => snapshotResolver(value, allowed));
});
