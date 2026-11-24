"use strict";

/**
 * Plays a list of audio URLs one after another.
 *
 * It needs a document with the `Audio` API: the Firefox background page, or the offscreen
 * document that Chromium's MV3 service worker uses (see offscreen/tts.html).
 */
var twpAudioPlayer = function () {
  let current = null;
  let resolveCurrent = null;
  let rate = 1.0;
  let session = 0;

  function playOne(url) {
    return new Promise(resolve => {
      const audio = new Audio(url);
      audio.playbackRate = rate;
      current = audio;
      resolveCurrent = resolve;
      audio.onended = () => resolve(true);
      audio.onerror = () => resolve(false);
      audio.play().catch(() => resolve(false));
    });
  }

  return {
    /**
     * @param {string[]} urls audio data URLs, played in order
     * @param {number} playbackRate
     * @returns {Promise<void>} resolves when the list ends or is stopped
     */
    async play(urls, playbackRate = 1.0) {
      this.stop();
      rate = Number(playbackRate) || 1.0;
      const mySession = ++session;
      for (const url of urls) {
        if (mySession !== session) break;
        if (!url) continue;
        await playOne(url);
      }
    },
    stop() {
      session++;
      if (current) {
        current.pause();
        current.currentTime = 0;
        current = null;
      }
      if (resolveCurrent) {
        const resolve = resolveCurrent;
        resolveCurrent = null;
        resolve(false);
      }
    },
    setRate(playbackRate) {
      rate = Number(playbackRate) || 1.0;
      if (current) current.playbackRate = rate;
    }
  };
}();
