import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isTestContact} from '../src/lib/server/private-contacts.ts';
test('private test contact protection normalizes addresses and rejects unrelated contacts', () => {
  const previous = process.env.MARCUS_TEST_CONTACT_EMAILS;
  try {
    process.env.MARCUS_TEST_CONTACT_EMAILS = ' Owner@example.com,second@example.com ';
    assert.equal(isTestContact(' OWNER@example.com '), true);
    assert.equal(isTestContact('second@example.com'), true);
    assert.equal(isTestContact('customer@example.com'), false);
    assert.equal(isTestContact(''), false);
    delete process.env.MARCUS_TEST_CONTACT_EMAILS;
    assert.equal(isTestContact('owner@example.com'), false);
  } finally {
    if (previous === undefined) delete process.env.MARCUS_TEST_CONTACT_EMAILS;
    else process.env.MARCUS_TEST_CONTACT_EMAILS = previous;
  }
});
