class MockAmbientWeatherApi {
    constructor(config) {
        this.config = config;
    }

    async deviceData(macAddress, options = {}) {
        const limit = options.limit || 1;
        const now = Date.now();
        const data = [];

        for (let i = 0; i < limit; i++) {
            const time = now - (i * 5 * 60 * 1000); // 5 minute intervals
            const entry = {
                date: new Date(time).toISOString(),
                macAddress: macAddress || '00:00:00:00:00:00',
                
                // Outdoor sensor (1)
                temp1f: 72 + Math.sin(time / 3600000) * 10 + Math.random(),
                humidity1: 45 + Math.random() * 5,
                batt1: 1,
                feelsLike1: 72 + Math.sin(time / 3600000) * 10,
                dewPoint1: 55,

                // Indoor sensor (2)
                temp2f: 68 + Math.random(),
                humidity2: 40 + Math.random() * 2,
                batt2: 1,
                feelsLike2: 68,
                dewPoint2: 50,
            };

            // Add more sensors if needed
            for (let j = 3; j <= 8; j++) {
                entry[`temp${j}f`] = 70 + Math.random() * 5;
                entry[`humidity${j}`] = 42 + Math.random() * 3;
                entry[`batt${j}`] = 1;
                entry[`feelsLike${j}`] = 70;
                entry[`dewPoint${j}`] = 52;
            }

            data.push(entry);
        }

        return data;
    }
}

module.exports = MockAmbientWeatherApi;
