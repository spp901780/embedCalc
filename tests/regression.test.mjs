import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, parse, resultBinLines, offsetToDigit, digitToOffset, locateNum, convertDigit, humanSize } from '../src/lib/calc';
import { evaluate } from '../src/lib/domain/evaluate';
import { appendHistory, decodeHistory, decodeRatio, writeStorage } from '../src/lib/state/persistence';
import { joinBinary, changeBase, tokenJump } from '../src/lib/state/editor';
import { older, newer, recall } from '../src/lib/state/history';
test('mixed radix, characters, C precedence and BigInt precision remain unchanged', () => {
    for (const [source, expected] of [['x10 + b11 + d2', 21n], ["'A' ^ x20", 97n], ['1 + 2 << 3', 24n], ['1 | 2 & 4', 1n], ['x123456789ABCDEF0', 0x123456789abcdef0n]])
        assert.equal(parse(tokenize(source)), expected);
});
test('evaluation states reject incomplete history entries and contain display failures', () => {
    assert.equal(evaluate('').status, 'empty');
    assert.equal(evaluate('1 +').status, 'preview');
    assert.equal(evaluate('1 +').result, 1n);
    for (const source of ['(', '(1', '1 + (', '~'])
        assert.equal(evaluate(source).status, 'preview');
    assert.equal(evaluate('1 + 2').status, 'valid');
    for (const source of ['1 / 0', '1 << 2049', '1 << 2048', '@', '1 2'])
        assert.equal(evaluate(source).status, 'error');
    assert.equal(evaluate('1 << 2047').status, 'valid');
});
test('two’s complement and human size formatting remain unchanged', () => {
    assert.deepEqual(resultBinLines(-128n), ['1000_0000']);
    assert.deepEqual(resultBinLines(-250n), ['1111_1111', '0000_0110']);
    assert.equal(humanSize(1024n), '1.00 K');
});
test('cursor mapping, base memory and token jumps', () => {
    const token = tokenize('b1111_0000')[0];
    for (const offset of [1, 2, 3, 4, 6, 7, 8, 9, 10])
        assert.equal(offsetToDigit(token, digitToOffset(token, offsetToDigit(token, offset))), offsetToDigit(token, offset));
    assert.equal(locateNum([token], 7)?.token, token);
    assert.equal(convertDigit(2, 16, 2), 8);
    const memory = new Map();
    const decimal = changeBase('xFF', 2, 1, memory);
    const binary = changeBase(decimal.expr, decimal.cursor, 1, memory);
    assert.equal(parse(tokenize(binary.expr)), 255n);
    const restoredDecimal = changeBase(binary.expr, binary.cursor, -1, memory);
    const restored = changeBase(restoredDecimal.expr, restoredDecimal.cursor, -1, memory);
    assert.deepEqual(restored, { expr: 'xFF', cursor: 2 });
    assert.equal(tokenJump('xFF + b1', 0, 1).cursor, 1);
});
test('binary concatenation handles both prefix forms without changing values', () => {
    assert.deepEqual(joinBinary('b10 b11', 7), { expr: 'b1011', cursor: 5 });
    assert.deepEqual(joinBinary('0b10 0b11', 9), { expr: '0b1011', cursor: 6 });
    assert.equal(joinBinary('b10 + b11', 9).expr, 'b10 + b11');
});
test('history compatibility, validation, deduplication, limit and ratio defaults', () => {
    const entries = decodeHistory(JSON.stringify(['xFF', { expr: '1', res: '1', hex: false }, null, { expr: '2', res: 2 }]));
    assert.deepEqual(entries[0], { expr: 'xFF', res: '0xFF', hex: true });
    assert.equal(entries[2].res, '');
    assert.deepEqual(decodeHistory('{}'), []);
    assert.deepEqual(decodeHistory('broken'), []);
    let history = [];
    for (let i = 0; i < 60; i++)
        history = appendHistory(history, { expr: String(i), res: String(i), hex: false });
    assert.equal(history.length, 50);
    history = appendHistory(history, history[0]);
    assert.equal(history.length, 50);
    assert.equal(history.at(-1)?.expr, '10');
    assert.equal(decodeRatio('0.6'), 0.6);
    assert.equal(decodeRatio('0.9'), 0.56);
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem() { throw new Error('denied'); } } });
    try { assert.equal(writeStorage('test', 'value'), false); } finally { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage; }
});
test('history recall keeps original draft and restores it after navigation', () => {
    const entries = decodeHistory('["1","2"]');
    const state = { pos: -1, draft: '', browsing: false, expr: 'draft expression' };
    const first = older(entries, state);
    assert.equal(first.expr, '2');
    const clicked = recall(entries, first, 0);
    assert.equal(clicked.draft, state.expr);
    const latest = newer(entries, clicked);
    const draft = newer(entries, latest);
    assert.equal(draft.expr, state.expr);
    assert.equal(draft.pos, -2);
    assert.equal(newer(entries, draft).browsing, false);
});
