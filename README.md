# Temperature Monitor

A Node.js application that displays temperature data from Ambient Weather sensors with historical tracking and pattern analysis.

## Features
- Real-time temperature monitoring
- Historical temperature graphs
- Daily pattern analysis
- Multiple sensor support
- Battery status monitoring

## Setup
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with your credentials:
   ```env
   AMBIENT_API_KEY=your_key_here
   AMBIENT_APPLICATION_KEY=your_app_key_here
   DEVICE_MAC_ADDRESS=your_mac_here
   LAT=your_latitude
   LON=your_longitude
   ```
4. Start the server:
   ```bash
   node server.js
   ```

## Environment Variables
- `AMBIENT_API_KEY`: Your Ambient Weather API key
- `AMBIENT_APPLICATION_KEY`: Your Ambient Weather Application key
- `DEVICE_MAC_ADDRESS`: Your device MAC address
- `LAT`: Latitude for weather data
- `LON`: Longitude for weather data

## Technologies Used
- Node.js
- Express
- EJS Templates
- Chart.js
- Ambient Weather API 