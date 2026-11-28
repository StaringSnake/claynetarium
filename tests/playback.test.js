import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlayback } from '../src/playback.js';
import { DAY, SECOND } from '../src/clock.js';

function started(wall = 1000) {
  const playback = createPlayback();
  playback.startLive(wall, 100);
  playback.setBounds(0, 10000);
  return playback;
}

test('live playback uses wall time and Now restores it after a rate change', () => {
  const playback = started();
  playback.setRate(60, 100);
  playback.advance(110, 2000);
  assert.equal(playback.instant, 1600);

  playback.startLive(3000, 120);
  assert.equal(playback.instant, 3000);
  playback.advance(130, 3500);

  assert.equal(playback.instant, 3500);
  assert.equal(playback.playing, true);
  assert.equal(playback.rate, 1);
});

test('changing speed anchors subsequent progress to the sampled instant', () => {
  const playback = started();
  playback.setRate(60, 100);
  playback.advance(110, 5000);

  playback.setRate(360, 111);
  playback.advance(110, 5000);
  assert.equal(playback.instant, 1600);
  playback.advance(121, 5000);

  assert.equal(playback.instant, 5200);
});

test('civil edits clamp to the current bounds and pause', () => {
  const playback = started();

  playback.edit(-50);
  assert.equal(playback.advance(110, 5000), false);

  assert.equal(playback.instant, 0);
  assert.equal(playback.playing, false);
});

test('event jumps pause at the supplied instant', () => {
  const playback = started();

  playback.pauseAt(4321);
  playback.advance(110, 5000);

  assert.equal(playback.instant, 4321);
  assert.equal(playback.playing, false);
});

test('advancing to the upper bound stops playback and does not allow resume', () => {
  const playback = started();

  assert.equal(playback.advance(110, 10000), true);

  assert.equal(playback.instant, 10000);
  assert.equal(playback.playing, false);
  assert.equal(playback.toggle(110), false);
});

test('advancing before the lower bound stops there but allows resume', () => {
  const playback = started();

  assert.equal(playback.advance(110, -1), true);

  assert.equal(playback.instant, 0);
  assert.equal(playback.playing, false);
  assert.equal(playback.toggle(110), true);
  playback.advance(120, 5000);
  assert.equal(playback.instant, 10);
});

test('replacing bounds preserves an instant outside the new range and pauses', () => {
  const playback = started();

  assert.equal(playback.setBounds(2000, 12000), false);
  playback.advance(110, 5000);

  assert.equal(playback.instant, 1000);
  assert.equal(playback.playing, false);
  assert.equal(playback.toggle(110), false);
});

test('replacing bounds within range preserves the active playback anchor', () => {
  const playback = started();
  playback.setRate(60, 100);
  playback.advance(110, 5000);

  assert.equal(playback.setBounds(500, 12000), true);
  playback.advance(120, 5000);

  assert.equal(playback.instant, 2200);
  assert.equal(playback.playing, true);
});

test('day, week, approximate month and approximate year rates advance exact fixed durations', () => {
  const playback = createPlayback();
  let real = 0, instant = Date.UTC(2024, 3, 8, 12);
  playback.startLive(instant, real);
  playback.setBounds(Date.UTC(1900, 0, 1), Date.UTC(2100, 11, 31, 23, 59, 59, 999));
  for (const days of [1, 7, 30, 365]) {
    playback.setRate(days * DAY / SECOND, real);
    assert.equal(playback.instant, instant, 'changing speed preserves the sampled anchor');
    playback.advance(real += SECOND, 0);
    assert.equal(playback.instant, instant += days * DAY);
  }
  playback.toggle(real);
  playback.setRate(DAY / SECOND, real);
  playback.advance(real += SECOND, 0);
  assert.equal(playback.instant, instant);
  playback.toggle(real);
  playback.advance(real + SECOND, 0);
  assert.equal(playback.instant, instant + DAY);

  playback.edit(playback.end - DAY / 2);
  playback.toggle(real);
  assert.equal(playback.advance(real + SECOND, 0), true, 'fast playback stops at the date bound');
  assert.equal(playback.instant, playback.end);
  assert.equal(playback.playing, false);
});
