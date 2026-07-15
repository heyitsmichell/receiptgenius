/**
 * ReceiptGenius Live Currency Service
 * Fetches real-time foreign exchange rates against HKD (Hong Kong Dollar)
 * using the public Open Exchange Rates API with automatic offline fallback.
 */

const FALLBACK_HKD_RATES = {
  HKD: 1.0,
  USD: 7.82,
  CNY: 1.08,
  JPY: 0.051,
  EUR: 8.45,
  GBP: 10.05,
  SGD: 5.80,
};

let cachedRates = null;
let lastFetchTime = 0;
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour cache

/**
 * Fetches current exchange rates (HKD per unit of foreign currency).
 * @returns {Promise<Object>} Map of currency codes to HKD multiplier e.g. { USD: 7.81, JPY: 0.0512 }
 */
export async function getLiveHKDExchangeRates() {
  const now = Date.now();
  if (cachedRates && now - lastFetchTime < CACHE_DURATION_MS) {
    return cachedRates;
  }

  try {
    const res = await fetch('https://open.er-api.com/v6/latest/HKD');
    if (!res.ok) throw new Error('API returned non-OK status');
    const data = await res.json();

    if (data && data.rates) {
      const liveRates = {
        HKD: 1.0,
        USD: data.rates.USD ? Number((1 / data.rates.USD).toFixed(4)) : FALLBACK_HKD_RATES.USD,
        CNY: data.rates.CNY ? Number((1 / data.rates.CNY).toFixed(4)) : FALLBACK_HKD_RATES.CNY,
        JPY: data.rates.JPY ? Number((1 / data.rates.JPY).toFixed(5)) : FALLBACK_HKD_RATES.JPY,
        EUR: data.rates.EUR ? Number((1 / data.rates.EUR).toFixed(4)) : FALLBACK_HKD_RATES.EUR,
        GBP: data.rates.GBP ? Number((1 / data.rates.GBP).toFixed(4)) : FALLBACK_HKD_RATES.GBP,
        SGD: data.rates.SGD ? Number((1 / data.rates.SGD).toFixed(4)) : FALLBACK_HKD_RATES.SGD,
      };
      cachedRates = liveRates;
      lastFetchTime = now;
      return liveRates;
    }
  } catch (err) {
    console.warn('Live currency fetch offline, using fallback rates:', err.message);
  }

  return cachedRates || FALLBACK_HKD_RATES;
}
