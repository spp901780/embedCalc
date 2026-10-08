import test from 'node:test';
import assert from 'node:assert/strict';
import { flipBit, basePreviews, truncatePreview, changeBase } from '../src/lib/state/editor';
import { tokenize, parse } from '../src/lib/calc';
test('bit edits preserve radix and surrounding tokens, including padding and BigInt', () => {
 for (const [source, bit, expected] of [['x0', 7, 'x80'], ['b1', 0, 'b0'], ['0b1_1111_0000', 9, 'b11_1111_0000'], ['d0', 0, '1'], ["'A'", 0, '64'], ["'\\n'", 7, '138'], ['x123456789ABCDEF0', 63, 'x923456789ABCDEF0']]) {
  const expr = '2 + ' + source + ' * 3', next = flipBit(expr, expr.length, 2, bit);
  assert.equal(next.expr, '2 + ' + expected + ' * 3');
  assert.equal(next.cursor, next.expr.length);
  assert.equal(parse(tokenize(expected)), tokenize(source)[0].value ^ (1n << BigInt(bit)));
 }
});
test('invalid expressions, targets and bit numbers cannot edit stale layouts', () => {
 for (const [expr, index, bit] of [['1 +', 0, 0], ['1 / 0', 0, 0], ['@', 0, 0], ['1', 1, 0], ['1 + 2', 1, 0], ['1', 0, -1], ['1', 0, 8], ['1', 0, 1.5]]) assert.deepEqual(flipBit(expr, 0, index, bit), { expr, cursor: 0 });
 for (let cursor = 0; cursor <= 12; cursor++) {
  const next = flipBit('1 + b1111_0000', cursor, 2, 7);
  assert.ok(next.cursor >= 0 && next.cursor <= next.expr.length);
 }
});
test('previews follow base conversion and stay within original token width', () => {
 for (const expr of ['xFF', '255', 'b1111_1111', "'A'", '0xF_F', '1']) {
  const cursor = tokenize(expr)[0].digitStart;
  const preview = basePreviews(expr, cursor);
  assert.ok(preview);
  assert.equal(preview.width, expr.length);
  for (const [direction, text] of [[-1, preview.up], [1, preview.down]]) {
   const converted = changeBase(expr, cursor, direction, new Map());
   assert.equal(text, converted.expr === expr ? null : converted.expr);
   if (text !== null) assert.ok(truncatePreview(text, preview.width).length <= Math.max(2, preview.width));
  }
 }
 assert.equal(basePreviews('@', 0), null);
 assert.equal(basePreviews('1 + 2', 3), null);
 assert.equal(truncatePreview('b1000', 1), 'b1');
 assert.equal(truncatePreview('b1000', 2), 'b1');
 assert.equal(truncatePreview('b1000', 3), 'b1…');
 assert.equal(truncatePreview('1', 0), '1');
});
