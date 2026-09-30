const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCredentials, validateTodoPayload, hashPassword, verifyPassword } = require('../server');

test('validates strong authentication credentials', () => {
  assert.equal(validateCredentials({ email: 'user@example.com', password: 'correct horse battery staple' }), null);
  assert.ok(validateCredentials({ email: 'bad', password: 'short' }));
});

test('validates todo payloads on the server', () => {
  assert.equal(validateTodoPayload({ text: 'Ship it', completed: false }), null);
  assert.ok(validateTodoPayload({ text: '' }));
  assert.ok(validateTodoPayload({ text: 'x'.repeat(501) }));
});

test('password hashing is one-way and verifiable', () => { const hash = hashPassword('correct horse battery staple'); assert.equal(verifyPassword('correct horse battery staple', hash), true); assert.equal(verifyPassword('wrong password', hash), false); assert.match(hash, /^scrypt\$/); });
