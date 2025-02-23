const fs = require('fs').promises;
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../data/settings.json');

// Ensure the data directory exists
async function ensureDataDir() {
    const dir = path.dirname(SETTINGS_FILE);
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch (err) {
        if (err.code !== 'EEXIST') throw err;
    }
}

// Default settings
const defaultSettings = {
    sensors: Array.from({ length: 8 }, (_, i) => ({
        id: i + 1,
        name: `Sensor ${i + 1}`,
        enabled: true
    }))
};

async function getSettings() {
    try {
        await ensureDataDir();
        const data = await fs.readFile(SETTINGS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        if (err.code === 'ENOENT') {
            await saveSettings(defaultSettings);
            return defaultSettings;
        }
        throw err;
    }
}

async function saveSettings(settings) {
    await ensureDataDir();
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    return settings;
}

module.exports = { getSettings, saveSettings }; 