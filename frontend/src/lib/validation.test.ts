import { describe, expect, it } from 'vitest';
import { normalizeTodoText, validateTodoText } from './validation';

describe('todo validation', () => {
  it('normalizes whitespace', () => {
    expect(normalizeTodoText('  hello   world  ')).toBe('hello world');
  });
  it('rejects empty text', () => {
    expect(validateTodoText('   ')).toBeTruthy();
  });
  it('rejects text longer than 500 characters', () => {
    expect(validateTodoText('x'.repeat(501))).toBeTruthy();
  });
  it('accepts valid text', () => {
    expect(validateTodoText('Buy milk')).toBeNull();
  });
});
