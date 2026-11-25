// Service health and fallback for the translation services (Google, Bing, Yandex, DeepL, Groq, LibreTranslate).
//
// Google, Bing and Yandex use endpoints that are not official APIs. They break from time to time, and they can ask
// for a captcha. When a service fails several times in a row, it is left out for a while, and the next enabled service
// that supports the language translates instead. A service that works again is used again.
//
// This is a plain script (no import/export), so it loads with importScripts() in the service worker and with the
// background scripts in Firefox, and the unit tests load it into a sandbox.
//
// The state lives in memory. The service worker can restart, which clears it. That is acceptable: the cooldown is short.

/**
 * @param {{failuresBeforeCooldown?: number, cooldownMs?: number, now?: () => number}} [options]
 */
function createServiceHealth(options = {}) {
  const failuresBeforeCooldown = options.failuresBeforeCooldown ?? 3;
  const cooldownMs = options.cooldownMs ?? 5 * 60 * 1000;
  const now = options.now ?? (() => Date.now());
  /** @type {Map<string, {failures: number, openUntil: number}>} */
  const states = new Map();

  return {
    /** True when the service may be tried now. After the cooldown it is tried again (one failure sends it back). */
    isHealthy(name) {
      const state = states.get(name);
      if (!state || state.failures < failuresBeforeCooldown) return true;
      return state.openUntil <= now();
    },
    recordSuccess(name) {
      states.delete(name);
    },
    recordFailure(name) {
      const state = states.get(name) || { failures: 0, openUntil: 0 };
      state.failures++;
      if (state.failures >= failuresBeforeCooldown) state.openUntil = now() + cooldownMs;
      states.set(name, state);
    },
    /** The names in the same order, healthy services first. Unhealthy ones stay in the list, so nothing is dropped. */
    order(names) {
      const healthy = names.filter(name => this.isHealthy(name));
      const unhealthy = names.filter(name => !healthy.includes(name));
      return [...healthy, ...unhealthy];
    },
  };
}

/**
 * Tries the services in order until one translates. Every failure is recorded, and onError is called for it.
 * Returns the result and the name of the service that gave it. Throws the last error when every service failed.
 * @template T
 * @param {string[]} candidates service names, in the order the user set them
 * @param {ReturnType<typeof createServiceHealth>} health
 * @param {(name: string) => Promise<T>} run translates with one service
 * @param {(error: unknown, name: string) => void} [onError]
 * @returns {Promise<{result: T, service: string}>}
 */
async function runWithServiceFallback(candidates, health, run, onError) {
  let lastError = null;
  for (const name of health.order(candidates)) {
    try {
      const result = await run(name);
      health.recordSuccess(name);
      return { result, service: name };
    } catch (error) {
      health.recordFailure(name);
      if (onError) onError(error, name);
      lastError = error;
    }
  }
  throw lastError || new Error("No translation service is enabled for this language.");
}
