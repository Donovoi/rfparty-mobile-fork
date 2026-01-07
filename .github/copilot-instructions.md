# GitHub Copilot Instructions for RFParty Mobile

This file provides context and guidelines for GitHub Copilot when assisting with code in this repository.

## Repository Context

RFParty Mobile is a Bluetooth Low Energy (BLE) scanner and analysis tool built as a Cordova mobile application. It visualizes BLE devices on an interactive map and provides detailed information about their advertisements.

## Code Conventions

### Module System
- Use **ES6 imports** for local modules: `import { ClassName } from './module'`
- Use **CommonJS require** for npm packages: `const package = require('package-name')`
- Always use relative paths for local imports

### Async Patterns
- Prefer **async/await** over callbacks and raw promises
- Use try/catch blocks for error handling
- Always handle promise rejections

### Debug Logging
- Use the `debug` module for logging: `const debug = require('debug')('module-name')`
- Avoid `console.log` in production code paths
- Include meaningful context in debug messages

### Event Handling
- Use EventEmitter from 'last-eventemitter' for custom events
- Clean up event listeners in cleanup/destroy methods
- Use arrow functions for event handlers to maintain context

## Key Architectural Patterns

### BLE Scanning Flow
1. Request permissions (Android)
2. Initialize BLE plugin via Cordova
3. Start scanning with filters
4. Parse advertisement data
5. Update device tracking
6. Display on map with markers

### Data Layer
- LokiJS for in-memory database
- Document-based storage in `RFPartyDocuments`
- Dataparty API for sync and persistence

### UI Updates
- MainWindow class manages primary UI
- Event-driven UI updates
- Leaflet for map rendering
- JSON Viewer for device details

## Common Tasks

### Adding a New BLE Parser
1. Create parser in `src/parsers/` directory
2. Export from parser module
3. Register in GAP parser dispatcher
4. Add tests if applicable

### Adding a New UI Component
1. Add HTML structure to index.html or generate dynamically
2. Style in src/main.css or src/style.css
3. Wire up events in MainWindow or relevant controller
4. Update on data changes via events

### Adding a New Cordova Plugin
1. Add to package.json devDependencies
2. Configure in config.xml cordova.plugins section
3. Handle deviceready event before usage
4. Add permission requests if needed

## Important Files

- **src/rfparty.js**: Core RFParty class, BLE scanning logic
- **src/main-window.js**: UI controller and map management
- **src/app.js**: Application entry point
- **src/gap-parser.js**: BLE advertisement parser
- **src/parsers/**: Manufacturer-specific parsers
- **config.xml**: Cordova configuration
- **package.json**: Dependencies and build scripts

## Domain Knowledge

### BLE Advertisement Structure
- Advertisement data is byte array with length-type-value (LTV) format
- Common types: 0x01 (Flags), 0x09 (Complete Local Name), 0xFF (Manufacturer Data)
- UUIDs can be 16-bit, 32-bit, or 128-bit
- RSSI is signal strength in dBm (negative values, higher is stronger)

### Geolocation
- Uses Cordova geolocation and background geolocation plugins
- Tracks device location for contextual BLE scanning
- Calculates distances using earth-distance-js
- Displays on Leaflet map with Mapbox tiles

### Cordova Lifecycle
- Wait for 'deviceready' event before accessing plugins
- Handle 'pause' and 'resume' for background/foreground transitions
- Clean up resources on 'pause' to save battery

## Testing Considerations

- BLE testing requires real Android devices
- Emulator has limited BLE support
- Test permission flows on different Android versions
- Verify background scanning behavior
- Check battery impact

## Build and Development

### Development Commands
```bash
npm install          # Install dependencies
npm run init         # Initialize Cordova project
npm run lint         # Run ESLint
npm run build        # Production build
npm run build-dev    # Development build
npx cordova run      # Run on device/emulator
```

### Build Process
1. Parcel bundles JavaScript from src/
2. Outputs to www/ directory
3. Cordova packages as Android APK
4. Install on device via ADB

## Dependencies to Know

- **cordova-plugin-ble-central**: BLE scanning API
- **leaflet**: Interactive maps
- **lokijs**: In-memory database
- **moment**: Date/time handling
- **@dataparty/api**: Data sync framework
- **debug**: Logging utility

## Anti-Patterns to Avoid

- Don't use synchronous file operations
- Don't start BLE scanning before deviceready
- Don't forget to stop scanning to save battery
- Don't leak event listeners (always clean up)
- Don't assume BLE permissions are granted
- Don't mix callback and promise patterns in same function

## Helpful Hints

- RSSI values: -30 to -50 dBm is excellent, -70 to -90 dBm is poor
- BLE scan intervals: shorter = more battery drain, longer = missed devices
- Cordova plugins: always check if plugin is available before use
- Map markers: use clustering for many devices to avoid performance issues
- Data persistence: LokiJS is in-memory, use Dataparty for persistence

---

These instructions help Copilot understand the codebase context and provide better suggestions tailored to this project's patterns and requirements.
