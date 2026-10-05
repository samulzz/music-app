const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createListeningTracker } = require('../src/renderer/listening-tracker.js');

test('seeks and paused time are not listened seconds', () => {
  const tracker = createListeningTracker();
  tracker.sample('song', 0, true, 0);
  tracker.sample('song', 5, true, 5000);
  tracker.sample('song', 180, true, 6000); // Seek forward.
  tracker.sample('song', 185, false, 11000);
  tracker.sample('song', 185, false, 71000);
  assert.equal(tracker.take('song'), 10);
  assert.equal(tracker.take('song'), null); // No duplicate skip/ended report.
});

test('changing tracks and long suspended gaps never transfer listening credit', () => {
  const tracker = createListeningTracker();
  tracker.sample('first', 50, true, 0);
  tracker.sample('first', 55, true, 5000);
  tracker.sample('second', 0, true, 6000);
  tracker.sample('second', 180, true, 186000);
  assert.equal(tracker.take('first'), null);
  assert.equal(tracker.take('second'), 0);
});
