const fs = require('fs').promises;
const path = require('path');

const CACHE_FILE = process.env.USE_MOCK_DATA === 'true'
    ? path.join(__dirname, '../data/mock_temperature_cache.json')
    : path.join(__dirname, '../data/temperature_cache.json');
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

async function ensureCacheDir() {
    const dir = path.dirname(CACHE_FILE);
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch (err) {
        if (err.code !== 'EEXIST') throw err;
    }
}

async function loadCache() {
    try {
        await ensureCacheDir();
        const data = await fs.readFile(CACHE_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        if (err.code === 'ENOENT') {
            const emptyCache = { readings: {}, lastUpdated: Date.now() };
            await saveCache(emptyCache);
            return emptyCache;
        }
        throw err;
    }
}

async function saveCache(cache) {
    await ensureCacheDir();
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
    return cache;
}

function getDayKey(date) {
    return new Date(date).toISOString().split('T')[0];
}

async function getCachedData(startDate, endDate) {
    const cache = await loadCache();
    const readings = cache.readings;

    // Convert dates to day keys
    const start = getDayKey(startDate);
    const end = getDayKey(endDate);

    // Find all days in range that are cached
    const cachedDays = Object.keys(readings)
        .filter(day => day >= start && day <= end)
        .sort();

    return {
        cachedData: cachedDays.flatMap(day => readings[day]),
        missingRanges: findMissingRanges(cachedDays, start, end)
    };
}

function findMissingRanges(cachedDays, start, end) {
    const ranges = [];
    let currentDate = new Date(start);
    const endDate = new Date(end);

    while (currentDate <= endDate) {
        const currentKey = getDayKey(currentDate);

        if (!cachedDays.includes(currentKey)) {
            const rangeStart = new Date(currentDate);

            // Find the end of this missing range
            while (currentDate <= endDate && !cachedDays.includes(getDayKey(currentDate))) {
                currentDate.setDate(currentDate.getDate() + 1);
            }

            ranges.push({
                startDate: rangeStart.getTime(),
                endDate: new Date(currentDate).getTime() - 1
            });
        } else {
            currentDate.setDate(currentDate.getDate() + 1);
        }
    }

    return ranges;
}

async function cacheReadings(readings) {
    const cache = await loadCache();

    // Group readings by day
    readings.forEach(reading => {
        const dayKey = getDayKey(reading.date);
        if (!cache.readings[dayKey]) {
            cache.readings[dayKey] = [];
        }
        // Only add if not already cached
        if (!cache.readings[dayKey].some(r => r.date === reading.date)) {
            cache.readings[dayKey].push(reading);
        }
    });

    cache.lastUpdated = Date.now();
    await saveCache(cache);
}

module.exports = {
    getCachedData,
    cacheReadings
}; 