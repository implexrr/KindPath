import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWebsiteEntry } from './websiteEntry';
import { websiteUrl } from '../../scanner/gateway/url.mjs';

test('website entry defaults to HTTPS and preserves explicit HTTP, paths and queries',()=>{
  for(const [input,expected] of [
    ['example.com','https://example.com/'],['  Example.COM/path?q=one  ','https://example.com/path?q=one'],
    ['www.example.com','https://www.example.com/'],['example.com:443/path','https://example.com/path'],
    ['http://example.com/path?q=one','http://example.com/path?q=one'],['HTTPS://EXAMPLE.COM/','https://example.com/'],
  ]) assert.equal(normalizeWebsiteEntry(input),expected);
});
test('entry does not repair unsupported schemes, credentials or ambiguous input',()=>{
  for(const value of ['', '   ', '//example.com', '/example.com', '?example.com', '#example.com',
    'http:example.com','https:/example.com','ftp://example.com','javascript:alert(1)','file:///etc/passwd',
    'user:pass@example.com','user@example.com','https://user:pass@example.com','https://example.com\\@other.com',
    'example.com/with space','example.com\n','example.com\t','example.com/'+ 'x'.repeat(2048)]) {
    assert.throws(()=>normalizeWebsiteEntry(value),value);
  }
});
test('normalization does not bypass the existing public syntax policy',()=>{
  for(const value of ['127.0.0.1','2130706433','0x7f000001','[::1]','localhost','printer.local',
    'example.com:8443','https://example.com/#section','https://example.com:8080/']) {
    assert.throws(()=>websiteUrl(normalizeWebsiteEntry(value)),value);
  }
  assert.equal(websiteUrl(normalizeWebsiteEntry('example.com/path')).href,'https://example.com/path');
});

test('explicit HTTP schemes require a hostname immediately after two slashes',()=>{
  for(const value of ['https:///example.com','http:////example.com','HTTPS:////example.com/path']) {
    assert.throws(()=>normalizeWebsiteEntry(value),value);
  }
});
