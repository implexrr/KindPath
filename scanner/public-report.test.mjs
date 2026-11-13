import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRules } from './public-report.mjs';
const node = { target: ['.fixture'], failureSummary: 'review', html: '<p>excluded</p>' };
const rule = { id: 'test', impact: null, help: 'Help', description: 'Description', helpUrl: 'https://example.com/', nodes: [node] };

test('public report serialization bounds output and counts every omitted rule and element', () => {
  const input = Array.from({ length: 101 }, () => ({ ...rule, nodes: Array.from({ length: 25 }, () => node) }));
  const output = summarizeRules(input);
  assert.equal(output.rules.length, 100);
  assert.equal(output.rules[0].nodes.length, 20);
  assert.equal(output.omittedRules, 1);
  assert.equal(output.omittedNodes, 525);
  assert.equal(output.rules[0].impact, 'unknown');
  assert.equal('html' in output.rules[0].nodes[0], false);
  assert.equal(input[0].nodes.length, 25);
});
test('complete and empty result sets have no omitted items', () => {
  assert.deepEqual(summarizeRules([]), { rules: [], omittedRules: 0, omittedNodes: 0 });
  const output = summarizeRules([rule]);
  assert.equal(output.omittedRules, 0); assert.equal(output.omittedNodes, 0);
  assert.equal(output.rules[0].nodes[0].summary, 'review');
});

test('oversized selector paths omit the element and preserve the rule and valid elements', () => {
  const boundary = 'a'.repeat(4000);
  const output = summarizeRules([{ ...rule, nodes: [
    { ...node, target: [boundary + 'a'] },
    { ...node, target: [[boundary]] },
    { ...node, target: Array(101).fill('a') },
    { ...node, target: Array(100).fill(boundary) },
  ] }]);
  assert.equal(output.omittedRules, 0);
  assert.equal(output.omittedNodes, 3);
  assert.equal(output.rules[0].id, rule.id);
  assert.deepEqual(output.rules[0].nodes, [{ target: Array(100).fill(boundary), summary: 'review' }]);
});
