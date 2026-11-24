"use strict";

const textToSpeech = function () {
  const textToSpeech = {};

  /** Max audio clips kept in memory per service. Older clips are dropped and downloaded again if needed. */
  const MAX_CACHED_CLIPS = 40;

  /**
   * Turns a Blob into a data URL without FileReader (not available in service workers).
   * @param {Blob} blob
   * @returns {Promise<string>}
   */
  async function blobToDataURL(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return "data:" + (blob.type || "audio/mpeg") + ";base64," + btoa(binary);
  }

  /** True when this context can play audio itself (Firefox background page). */
  const canPlayHere = () => typeof Audio === "function";

  /**
   * Chromium MV3: audio plays in an offscreen document. It is created on demand and reused.
   * @returns {Promise<void>}
   */
  async function ensureOffscreenDocument() {
    const offscreenApi = chrome.offscreen;
    if (!offscreenApi) throw new Error("Audio playback is not available in this browser");
    if (offscreenApi.hasDocument && (await offscreenApi.hasDocument())) return;
    try {
      await offscreenApi.createDocument({
        url: "offscreen/tts.html",
        reasons: ["AUDIO_PLAYBACK"],
        justification: "Read translated text aloud"
      });
    } catch (e) {
      // "Only a single offscreen document may be created": another call got there first.
      if (!String(e && e.message).includes("single offscreen")) throw e;
    }
  }

  /**
   * Plays audio data URLs in order, with the chosen speed.
   * @param {string[]} urls
   * @param {number} speed
   * @returns {Promise<void>}
   */
  async function playUrls(urls, speed) {
    if (canPlayHere()) {
      return await twpAudioPlayer.play(urls, speed);
    }
    await ensureOffscreenDocument();
    return await new Promise(resolve => {
      chrome.runtime.sendMessage({ action: "twp-tts-play", urls, rate: speed }, () => {
        void chrome.runtime.lastError;
        resolve();
      });
    });
  }

  function stopPlayback() {
    if (canPlayHere()) {
      twpAudioPlayer.stop();
    } else {
      chrome.runtime.sendMessage({ action: "twp-tts-stop" }, () => void chrome.runtime.lastError);
    }
  }

  function setPlaybackRate(speed) {
    if (canPlayHere()) {
      twpAudioPlayer.setRate(speed);
    } else {
      chrome.runtime.sendMessage({ action: "twp-tts-rate", rate: speed }, () => void chrome.runtime.lastError);
    }
  }

  class Service {
    /**
     * Defines the Service class for the text-to-speech service.
     * @param {string} serviceName
     * @param {string} baseURL
     * @param {"GET" | "POST"} xhrMethod
     * @param {(text: string, targetLanguage: string) => string} cbGetExtraParameters
     */
    constructor(serviceName, baseURL, xhrMethod, cbGetExtraParameters) {
      this.serviceName = serviceName;
      this.baseURL = baseURL;
      this.xhrMethod = xhrMethod;
      this.cbGetExtraParameters = cbGetExtraParameters;
      /** @type {Map<string, string>} audio data URLs, bounded by MAX_CACHED_CLIPS */
      this.clips = new Map();
      this.audioSpeed = 1.0;
    }

    /**
     * Splits a long text into pieces of less than 170 characters, so each request stays small.
     * @param {string} fullText
     * @returns {string[]}
     */
    getRequests(fullText) {
      /** @type {string[]} */
      const fullTextSplitted = [];
      fullText.trim().split(" ").forEach(word => {
        while (word.length > 160) {
          fullTextSplitted.push(word.slice(0, 160));
          word = word.slice(160);
        }
        if (word.trim().length > 0) {
          fullTextSplitted.push(word);
        }
      });

      /** @type {string[]} */
      const requests = [];
      let requestString = "";
      for (let text of fullTextSplitted) {
        text += " ";
        if (requestString.length + text.length < 170) {
          requestString += text;
        } else {
          requests.push(requestString);
          requestString = text;
        }
      }
      if (requestString.trim().length > 0) {
        requests.push(requestString);
      }
      return requests;
    }

    /**
     * Downloads one clip and returns it as an audio data URL.
     * @param {string} text
     * @param {string} targetLanguage
     * @returns {Promise<string>}
     */
    async makeRequest(text, targetLanguage) {
      return await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.withCredentials = false;
        if ("mozAnon" in xhr) xhr.mozAnon = true; // Firefox: never send Google cookies with TTS requests
        xhr.timeout = 20000;
        xhr.responseType = "blob";
        xhr.onload = () => {
          if (!xhr.response) return reject(new Error("empty audio response"));
          blobToDataURL(xhr.response).then(resolve, reject);
        };
        xhr.onerror = xhr.onabort = xhr.ontimeout = () => reject(new Error("text-to-speech request failed"));
        xhr.open(this.xhrMethod, this.baseURL + this.cbGetExtraParameters(text, targetLanguage));
        xhr.send();
      });
    }

    /**
     * Remembers a clip and keeps the cache bounded.
     * @param {string} key
     * @param {string} url
     */
    rememberClip(key, url) {
      if (this.clips.size >= MAX_CACHED_CLIPS) {
        this.clips.delete(this.clips.keys().next().value);
      }
      this.clips.set(key, url);
    }

    /**
     * Transforms text into audio and plays it.
     * @param {string} fullText
     * @param {string} targetLanguage
     * @returns {Promise<void>}
     */
    async textToSpeech(fullText, targetLanguage) {
      const requests = this.getRequests(fullText);
      const keys = requests.map(text => [targetLanguage, text].join(", "));
      const missing = requests.filter((text, i) => !this.clips.has(keys[i]));
      const results = await Promise.all(missing.map(text =>
        this.makeRequest(text, targetLanguage).then(url => ({ text, url }), e => {
          console.error(e);
          return null;
        })
      ));
      for (const result of results) {
        if (result) this.rememberClip([targetLanguage, result.text].join(", "), result.url);
      }
      const urls = keys.map(key => this.clips.get(key)).filter(Boolean);
      if (urls.length === 0) return;
      await playUrls(urls, this.audioSpeed);
    }

    /**
     * Sets the audio speed and applies it to the clip that is playing.
     * @param {number} speed
     */
    setAudioSpeed(speed) {
      this.audioSpeed = Number(speed) || 1.0;
      setPlaybackRate(this.audioSpeed);
    }

    /** Stops playback. */
    stopAll() {
      stopPlayback();
    }
  }

  // Create a Service instance based on google's text-to-speech service.
  const googleService = new Service("google", "https://translate.google.com/translate_tts?ie=UTF-8", "GET", function getExtraParameters(text, targetLanguage) {
    return `&tl=${targetLanguage}&client=dict-chrome-ex&ttsspeed=0.5&q=${encodeURIComponent(text)}`;
  });

  // Listen for messages coming from contentScript or other scripts.
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "textToSpeech") {
      googleService.textToSpeech(request.text, request.targetLanguage).catch(e => console.error(e)).finally(() => {
        sendResponse();
      });
      return true;
    } else if (request.action === "stopAudio") {
      googleService.stopAll();
    }
  });

  // Listen for changes to the audio speed setting and apply it immediately.
  twpConfig.onReady(async () => {
    twpConfig.onChanged((name, newvalue) => {
      if (name === "ttsSpeed") {
        googleService.setAudioSpeed(newvalue);
      }
    });
  });
  textToSpeech.google = googleService;
  return textToSpeech;
}();
