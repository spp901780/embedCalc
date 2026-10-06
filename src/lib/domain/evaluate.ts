import { tokenize, parse, type Token } from './core';
import { resultBinLines } from './format';
import { buildLayout } from './view';

export interface Evaluation {
 status: 'empty' | 'preview' | 'valid' | 'error';
 tokens: Token[] | null;
 layout: ReturnType<typeof buildLayout> | null;
 result: bigint | null;
 binary: string[];
 error: string | null;
}
export function evaluate(source: string): Evaluation {
 const state: Evaluation = { status: 'empty', tokens: null, layout: null, result: null, binary: [], error: null };
 try {
  state.tokens = tokenize(source);
  if (!state.tokens.length) return state;
  let effective = state.tokens;
  while (effective.length && ['op', 'lparen'].includes(effective.at(-1)!.kind)) effective = effective.slice(0, -1);
  state.status = effective.length === state.tokens.length ? 'valid' : 'preview';
  if (!effective.length) return state;
  const result = parse(effective);
  const binary = resultBinLines(result);
  const layout = buildLayout(effective);
  return { ...state, result, binary, layout };
 } catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  // Open groups and missing operands are incomplete, not valid expressions.
  if (message === '缺少右括号' || message === '表达式意外结束') return { ...state, status: 'preview' };
  return { ...state, status: 'error', error: message };
 }
}
