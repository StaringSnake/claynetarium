export function createPlayback() {
  let instant, rate = 1, playing = true, live = true;
  let startReal, startSim, first, last;

  function anchor(real) {
    startReal = real;
    startSim = instant;
  }

  function pause() {
    playing = live = false;
  }

  function clamp(instant) {
    return Math.max(first, Math.min(last, instant));
  }

  function pauseAt(next) {
    instant = next;
    pause();
  }

  return {
    get instant() { return instant; },
    get playing() { return playing; },
    get rate() { return rate; },
    get end() { return last; },

    startLive(wall, real) {
      instant = wall; playing = live = true; rate = 1;
      anchor(real);
    },

    setBounds(min, max) {
      first = min; last = max;
      if (instant < first || instant > last) {
        pause();
        return false;
      }
      return true;
    },

    // Returns true only when this advance stops playback at a boundary.
    advance(real, wall) {
      if (!playing) return false;
      const next = live ? wall : startSim + Math.max(0, real - startReal) * rate;
      if (next >= last || next < first) {
        // An instant preserved across a zone change must not snap to a boundary.
        if (instant >= first && instant <= last) instant = clamp(next);
        pause();
        return true;
      }
      instant = next;
      return false;
    },

    toggle(real) {
      if (!playing && (instant < first || instant >= last)) return false;
      playing = !playing; live = false;
      anchor(real);
      return true;
    },

    setRate(next, real) {
      rate = next; live = false;
      anchor(real);
    },

    edit(next) {
      pauseAt(clamp(next));
    },

    pauseAt,
  };
}
