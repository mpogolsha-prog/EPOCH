import axios from "axios";

const KAMINO_POOL_UUID = "d2141a59-c199-4be7-8d4b-c8223954836b";
const YIELDS_URL = `https://yields.llama.fi/chart/${KAMINO_POOL_UUID}`;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const FALLBACK_RATE_BPS = 400; // 4.00%

let cachedRate: number | null = null;
let cacheTimestamp = 0;

export async function getKaminoRate(): Promise<number> {
  const now = Date.now();
  if (cachedRate !== null && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedRate;
  }

  try {
    const res = await axios.get(YIELDS_URL, { timeout: 10000 });
    const data = res.data?.data;

    if (!Array.isArray(data) || data.length === 0) {
      console.warn("[RateOracle] Empty data from DefiLlama, using fallback");
      return FALLBACK_RATE_BPS;
    }

    const latest = data[data.length - 1];
    const apyPct = latest.apy;

    if (typeof apyPct !== "number" || isNaN(apyPct)) {
      console.warn("[RateOracle] Invalid APY value, using fallback");
      return FALLBACK_RATE_BPS;
    }

    // Convert APY % to basis points: 3.35% -> 335 bps
    const rateBps = Math.round(apyPct * 100);
    cachedRate = rateBps;
    cacheTimestamp = now;

    return rateBps;
  } catch (err: any) {
    console.warn(`[RateOracle] DefiLlama fetch failed: ${err.message}, using fallback ${FALLBACK_RATE_BPS} bps`);
    return FALLBACK_RATE_BPS;
  }
}
