# Copilot Instructions for RFParty Mobile

## Project Overview

RFParty is a mobile application for Bluetooth Low Energy (BLE) scanning and visualization. It's a "Bluetooth tricorder" that maps BLE signal propagation on a Leaflet map.

## Tech Stack

- **Framework**: Apache Cordova 11.x for mobile (Android)
- **Bundler**: ParcelJS 2.6.x
- **Language**: JavaScript (ES6+ modules)
- **Maps**: Leaflet.js with Mapbox tiles
- **Database**: LokiJS (in-memory document database)
- **API Layer**: @dataparty/api for document management
- **Linting**: ESLint

## Project Structure

```
├── src/                    # Main application source code
│   ├── app.js              # Application entry point
│   ├── main-window.js      # Main UI window logic
│   ├── rfparty.js          # Core RFParty class (map, BLE indexing, search)
│   ├── documents/          # Data document classes (IDocument subclasses)
│   │   ├── ble_adv.js      # BLE advertisement document
│   │   ├── ble_station.js  # BLE station document
│   │   ├── geo_track.js    # GPS track document
│   │   └── ...
│   ├── parsers/            # BLE packet parsers
│   │   ├── apple-continuity.js
│   │   └── uuid-parser.js
│   ├── assets/             # Static assets (copied to www/ on build)
│   └── *.css               # Stylesheets
├── party/                  # Data party schema definitions
│   ├── schema/             # Document schemas
│   └── rfparty-service.js  # Service definitions
├── scripts/                # Build and initialization scripts
├── config.xml              # Cordova configuration
├── index.html              # Main HTML entry point
└── www/                    # Build output directory (git-ignored)
```

## Key Classes and Patterns

### RFParty Class (`src/rfparty.js`)

Main application class extending `EventEmitter`. Responsible for:
- Map visualization with Leaflet
- BLE device indexing and querying
- Search functionality with custom query syntax

### Document Classes (`src/documents/`)

All documents extend `@dataparty/api`'s `IDocument` class. Key patterns:
- Static `index*` methods for creating/updating documents
- Static `DocumentSchema` getter for schema name
- Constructor takes `{ party, type, id, data }`

### MainWindow (`src/main-window.js`)

Static class managing UI state, permissions, and session lifecycle.

## Development Commands

```bash
# Install dependencies
npm install

# Initialize project directories
npm run init

# Add Android platform
npx cordova platform add android

# Development build (unminified)
npm run build-dev

# Production build
npm run build

# Run linter
npm run lint

# Run on device/emulator
npx cordova run android --debug
```

## Coding Conventions

### JavaScript Style

- Use ES6 module syntax (`import`/`export`) for new code
- Use CommonJS `require()` for @dataparty modules and Node.js dependencies
- Use `const` by default, `let` when reassignment needed
- Use template literals for string interpolation
- Use `async`/`await` for asynchronous operations

### Naming Conventions

- Classes: PascalCase (`RFParty`, `MainWindow`, `BleStationDocument`)
- Functions/methods: camelCase (`indexDevice`, `handleSearch`)
- Constants: UPPER_SNAKE_CASE (`TILE_SERVER_MAPBOX`)
- File names: lowercase with hyphens (`main-window.js`, `gap-parser.js`)

### Debug Logging

Use the `debug` package for logging:
```javascript
const debug = require('debug')('namespace')
debug('message', data)
```

### Event Handling

The app uses `last-eventemitter` for events:
```javascript
this.emit('event-name', payload)
this.on('event-name', callback)
```

## BLE Data Model

### Key Document Types

- `ble_adv`: Individual BLE advertisement packets
- `ble_station`: Aggregated data for a BLE device (by MAC address)
- `geo_track`: GPS track segments
- `geo_point`: Individual GPS points

### Query Syntax

The app supports search queries like:
- `name <text>` - Search by device local name
- `company <text>` - Search by manufacturer
- `address <mac>` - Search by MAC address
- `service <uuid>` - Search by service UUID
- `duration <time>` - Find devices seen for duration (e.g., `duration 1h`)
- `here` - Find devices in current viewport

## Cordova Plugins

Key plugins used:
- `cordova-plugin-ble-central` - BLE scanning
- `cordova-background-geolocation-plugin` - GPS tracking
- `cordova-plugin-background-mode` - Background execution
- `cordova-plugin-local-notification` - Notifications

## Global Variables

The app exposes globals on `window` for debugging:
- `window.rfparty` - RFParty instance
- `window.Dataparty` - Dataparty API
- `window.MainWindow` - MainWindow class

## Testing

Currently no automated tests (`npm test` exits with error). Manual testing is done through Cordova on Android devices/emulators.

## Important Notes

- The `www/` directory is the build output and is git-ignored
- Mapbox access token is embedded in `rfparty.js`
- The app requires location permissions for BLE scanning on Android
- Build artifacts go to `.dist/` and `.parcel-cache/` (git-ignored)
