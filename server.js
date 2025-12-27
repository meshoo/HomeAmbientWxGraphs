require('dotenv').config();
const express = require('express');
const AmbientWeatherApi = require('ambient-weather-api');
const { getSettings, saveSettings } = require('./models/settings');
const { getCachedData, cacheReadings } = require('./models/dataCache');

const app = express();
const port = 3000;

// Configure Ambient Weather API client
const MockAmbientWeatherApi = require('./mockApi');

// Configure Ambient Weather API client
let api;
if (process.env.USE_MOCK_DATA === 'true') {
    console.log('Using Mock Ambient Weather API');
    api = new MockAmbientWeatherApi();
} else {
    api = new AmbientWeatherApi({
        apiKey: process.env.AMBIENT_API_KEY,
        applicationKey: process.env.AMBIENT_APPLICATION_KEY
    });
}

// Add this after the API client configuration
const colors = [
    '#3b82f6', // blue
    '#ef4444', // red
    '#eab308', // yellow
    '#22c55e', // green
    '#8b5cf6', // purple
    '#f97316', // orange
    '#06b6d4', // cyan
    '#ec4899'  // pink
];

app.set('view engine', 'ejs');
app.use(express.static('public'));

// Add this helper function at the top of the file
function getDateRange(range) {
    const now = new Date();
    switch (range) {
        case '24h':
            return {
                endDate: now.getTime(),
                startDate: now.getTime() - (24 * 60 * 60 * 1000),
                limit: 288 // Still include limit for API call
            };
        case '7d':
            return {
                endDate: now.getTime(),
                startDate: now.getTime() - (7 * 24 * 60 * 60 * 1000)
            };
        case '1m':
            return {
                endDate: now.getTime(),
                startDate: now.getTime() - (30 * 24 * 60 * 60 * 1000)
            };
        case '3m':
            return {
                endDate: now.getTime(),
                startDate: now.getTime() - (90 * 24 * 60 * 60 * 1000)
            };
        default:
            return {
                endDate: now.getTime(),
                startDate: now.getTime() - (24 * 60 * 60 * 1000)
            };
    }
}

// Route for current temperature
app.get('/', async (req, res) => {
    try {
        console.log('Fetching current temperature data...');
        const deviceData = await api.deviceData(process.env.DEVICE_MAC_ADDRESS, { limit: 1 });
        const settings = await getSettings(); // Get sensor settings

        if (!deviceData || deviceData.length === 0) {
            console.error('No data received from device');
            return res.status(500).send('No data available from weather station');
        }

        const temperatures = settings.sensors.map(sensor => ({
            sensor: sensor.id,
            name: sensor.name,
            temp: deviceData[0][`temp${sensor.id}f`] || 0,
            humidity: deviceData[0][`humidity${sensor.id}`] || 0,
            battery: deviceData[0][`batt${sensor.id}`] || false,
            feelsLike: deviceData[0][`feelsLike${sensor.id}`] || 0,
            dewPoint: deviceData[0][`dewPoint${sensor.id}`] || 0,
            color: colors[sensor.id - 1] // Use same colors as patterns
        }));

        res.render('current', {
            temperatures,
            outdoorTemp: deviceData[0].temp1f || 0,
            lastUpdate: new Date(deviceData[0].date).toLocaleString(),
            currentPage: 'current'
        });
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).send('Error fetching temperature data: ' + error.message);
    }
});

// Route for temperature history
app.get('/history', async (req, res) => {
    try {
        const range = req.query.range || '24h';
        const dateRange = getDateRange(range);
        const settings = await getSettings();

        console.log('\nHistory Request:');
        console.log('═'.repeat(50));
        console.log('Range:', range);
        console.log('Start:', new Date(dateRange.startDate).toLocaleString());
        console.log('End:', new Date(dateRange.endDate).toLocaleString());

        // Validate date range
        if (!dateRange.startDate || !dateRange.endDate) {
            throw new Error('Invalid date range');
        }

        // Use the cache for historical data
        const { cachedData, missingRanges } = await getCachedData(dateRange.startDate, dateRange.endDate);
        console.log(`Found ${cachedData.length} cached readings`);
        console.log(`Missing ranges: ${missingRanges.length}`);

        // Fetch any missing data
        const newData = [];


        // Loop through missing ranges
        for (const range of missingRanges) {
            let current = range.startDate;
            const end = range.endDate;

            // Break large ranges into daily chunks
            while (current <= end) {
                const chunkEnd = Math.min(end, current + (24 * 60 * 60 * 1000) - 1);

                // Only log significant chunks or the first one
                console.log(`\nFetching chunk: ${new Date(current).toLocaleString()} to ${new Date(chunkEnd).toLocaleString()}`);

                const params = {
                    startDate: current,
                    endDate: chunkEnd,
                    limit: 288
                };

                try {
                    const rangeData = await api.deviceData(process.env.DEVICE_MAC_ADDRESS, params);
                    console.log(`Retrieved ${rangeData.length} readings`);

                    // Validate data structure
                    const validData = rangeData.filter(reading => {
                        if (!reading.date) {
                            console.warn('Reading missing date:', reading);
                            return false;
                        }
                        return true;
                    });

                    newData.push(...validData);

                    // Basic rate limiting
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    console.error('API call failed:', error.message);
                    if (error.message.includes('rate limit')) {
                        await new Promise(resolve => setTimeout(resolve, 5000));
                        // Retry this chunk if needed, for now just skip to avoid infinite loops
                    }
                }

                // Move to next day
                current = chunkEnd + 1;
            }
        }

        if (newData.length > 0) {
            console.log(`Caching ${newData.length} new readings`);
            await cacheReadings(newData);
        }

        // Combine and process all data
        const allData = [...cachedData, ...newData];
        console.log(`\nProcessing ${allData.length} total readings`);

        // Sort data by time
        allData.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Process data with validation
        const temperatures = allData.map(reading => {
            const data = { time: reading.date };
            settings.sensors.forEach(sensor => {
                const temp = reading[`temp${sensor.id}f`];
                data[`temp${sensor.id}`] = typeof temp === 'number' ? temp : null;
            });
            return data;
        });

        console.log('Data processing complete');
        console.log('═'.repeat(50));

        res.render('history', {
            temperatures: temperatures,
            selectedRange: range,
            sensors: settings.sensors,
            currentPage: 'history'
        });
    } catch (error) {
        console.error('Error in history route:', error);
        res.status(500).send(`Error fetching temperature history: ${error.message}`);
    }
});

// Add this logging helper
function logApiCall(params) {
    console.log('\nAPI Call:');
    console.log('─'.repeat(50));
    console.log('Start:', new Date(params.startDate).toLocaleString());
    console.log('End:', new Date(params.endDate).toLocaleString());
    console.log('Limit:', params.limit);
    console.log('─'.repeat(50));
}

// Add this helper function to calculate optimal limit
function calculateOptimalLimit(startDate, endDate, targetHour) {
    // Calculate number of days
    const days = Math.ceil((endDate - startDate) / (24 * 60 * 60 * 1000));

    // We need readings around our target hour (±15 minutes)
    // At 5-minute intervals, that's about 7 readings per day
    const readingsPerDay = 7;

    return Math.min(288, days * readingsPerDay); // Cap at max 288
}

// Update getDailyPatternData function
async function getDailyPatternData(months, hour, minute) {
    const now = new Date();
    const endDate = now.getTime();
    const startDate = now.getTime() - (months * 30 * 24 * 60 * 60 * 1000);

    console.log('\nData Request:');
    console.log('═'.repeat(50));
    console.log(`Period: ${months} month(s)`);
    console.log(`Target time: ${hour}:${minute}`);
    console.log(`Date range: ${new Date(startDate).toLocaleString()} to ${new Date(endDate).toLocaleString()}`);
    console.log('═'.repeat(50));

    // First check the cache
    const { cachedData, missingRanges } = await getCachedData(startDate, endDate);
    console.log(`\nCache status:`);
    console.log(`Found ${cachedData.length} cached readings`);
    console.log(`Missing ranges: ${missingRanges.length}`);

    console.log('Cached Data:', JSON.stringify(cachedData, null, 2));

    // Fetch missing data
    const newData = [];
    for (const range of missingRanges) {
        console.log(`\nFetching missing data from ${new Date(range.startDate).toLocaleDateString()} to ${new Date(range.endDate).toLocaleDateString()}`);

        const params = {
            startDate: range.startDate,
            endDate: range.endDate,
            limit: 288 // One day's worth of readings
        };

        logApiCall(params);

        try {
            const rangeData = await api.deviceData(process.env.DEVICE_MAC_ADDRESS, params);
            console.log(`Retrieved ${rangeData.length} readings`);
            newData.push(...rangeData);
        } catch (error) {
            console.error('API call failed:', error.message);
            if (error.message.includes('rate limit')) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        // Respect API rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('New Data:', JSON.stringify(newData, null, 2));

    // Cache new data if any was fetched
    if (newData.length > 0) {
        console.log(`\nCaching ${newData.length} new readings`);
        await cacheReadings(newData);
    }

    // Combine cached and new data
    const allData = [...cachedData, ...newData];
    console.log(`\nData Processing:`);
    console.log('─'.repeat(50));
    console.log(`Total readings available: ${allData.length}`);

    // Filter data points to those matching the specified time
    const filteredData = allData.filter(reading => {
        const readingDate = new Date(reading.date);
        const readingHour = readingDate.getHours();
        const readingMinute = readingDate.getMinutes();

        const minuteDiff = (readingHour * 60 + readingMinute) - (hour * 60 + minute);
        return Math.abs(minuteDiff) <= 15;
    });

    console.log(`Filtered to ${filteredData.length} readings near specified time`);

    // Sort by date and group by day
    filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));
    const dailyReadings = new Map();

    filteredData.forEach(reading => {
        const date = new Date(reading.date);
        const dayKey = date.toLocaleDateString();

        if (!dailyReadings.has(dayKey)) {
            dailyReadings.set(dayKey, reading);
        }
    });

    const result = Array.from(dailyReadings.values());
    console.log(`Final daily readings: ${result.length}`);
    console.log('─'.repeat(50));

    return result;
}

// Add these predefined times (moved up for organization)
const DEFAULT_TIMES = [
    { name: 'Breakfast', hour: 8, minute: 0 },
    { name: 'Lunch', hour: 12, minute: 0 },
    { name: 'Dinner', hour: 18, minute: 0 },
    { name: 'Bedtime', hour: 21, minute: 0 }
];

// Add new route for daily patterns
app.get('/patterns', async (req, res) => {
    try {
        const months = parseInt(req.query.months) || 1;
        const selectedTime = req.query.time || 'Breakfast';
        const settings = await getSettings();

        const timeConfig = DEFAULT_TIMES.find(t => t.name === selectedTime) || DEFAULT_TIMES[0];

        console.log(`Fetching ${months} month(s) of data for ${timeConfig.name} time (${timeConfig.hour}:${timeConfig.minute})...`);

        const patternData = await getDailyPatternData(months, timeConfig.hour, timeConfig.minute);

        if (!patternData || patternData.length === 0) {
            console.log('No data found for the specified time period');
            return res.render('patterns', {
                data: JSON.stringify([]),
                months,
                selectedTime,
                times: DEFAULT_TIMES,
                settings: JSON.stringify(settings),
                currentPage: 'patterns',
                error: 'No data found for the specified time period'
            });
        }

        console.log(`Processing ${patternData.length} readings...`);

        // Process the data with proper date formatting and sensor data
        const processedData = patternData.map(reading => ({
            date: new Date(reading.date).toLocaleDateString(),
            temps: Array.from({ length: 8 }, (_, i) => {
                const temp = reading[`temp${i + 1}f`];
                return typeof temp === 'number' ? temp : null;
            }),
            tempf: reading.tempf || reading.temp1f || null // Use tempf or temp1f as fallback
        }));

        console.log('Sample processed reading:', processedData[0]);
        console.log(`Successfully processed ${processedData.length} readings`);

        res.render('patterns', {
            data: JSON.stringify(processedData),
            months,
            selectedTime,
            times: DEFAULT_TIMES,
            settings: JSON.stringify(settings),
            currentPage: 'patterns'
        });
    } catch (error) {
        console.error('Error fetching pattern data:', error);
        res.status(500).send('Error fetching pattern data: ' + error.message);
    }
});

// Add new routes for settings
app.get('/api/settings', async (req, res) => {
    try {
        const settings = await getSettings();
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/settings', express.json(), async (req, res) => {
    try {
        const settings = await saveSettings(req.body);
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add API connection test on startup
app.listen(port, async () => {
    console.log(`Server running at http://localhost:${port}`);

    // Test API connection
    try {
        console.log('Testing API connection...');
        console.log('Using MAC address:', process.env.DEVICE_MAC_ADDRESS);
        const testData = await api.deviceData(process.env.DEVICE_MAC_ADDRESS, { limit: 1 });
        console.log('API connection successful!');
        console.log('Sample data:', JSON.stringify(testData, null, 2));
    } catch (error) {
        console.error('API connection test failed!');
        console.error('Error details:', {
            message: error.message,
            stack: error.stack
        });
    }
}); 