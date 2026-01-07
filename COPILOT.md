# GitHub Copilot Usage Guide for RFParty Mobile

This document provides guidance on using GitHub Copilot effectively with the RFParty Mobile codebase.

## Overview

RFParty Mobile is a Bluetooth Low Energy (BLE) scanning and analysis application built with Apache Cordova and JavaScript. GitHub Copilot is enabled for this repository to assist developers with code generation, understanding, and refactoring.

## Repository Compatibility

### Supported Languages
- **JavaScript (ES6+)**: Primary language for application logic
- **HTML5**: UI templates and structure
- **CSS3**: Styling and animations
- **JSON**: Configuration files and data structures

### Technology Stack
- **Apache Cordova**: Cross-platform mobile framework
- **Parcel.js**: Build tool and bundler
- **Leaflet**: Interactive maps
- **Node.js**: Development tooling
- **ESLint**: Code linting

## How Copilot Can Help

### 1. BLE Protocol Understanding
Copilot can assist with:
- Parsing BLE advertisement data and GAP (Generic Access Profile) packets
- Understanding 16-bit UUID service identifiers
- Working with manufacturer-specific data
- Interpreting RSSI (Received Signal Strength Indicator) values
- Handling BLE connection states and events

**Example prompts:**
```javascript
// Parse BLE advertisement data from advertising packet
// Convert raw BLE manufacturer data to human-readable format
// Calculate distance from RSSI value using path loss model
```

### 2. Cordova Plugin Integration
Copilot understands Cordova patterns and can help with:
- Plugin API usage (BLE Central, Geolocation, Background Mode)
- Device permission handling
- Platform-specific code (Android)
- Cordova lifecycle events (deviceready, pause, resume)

**Example prompts:**
```javascript
// Request Android BLE scan permissions
// Handle Cordova deviceready event
// Use cordova-plugin-ble-central to scan for devices
```

### 3. Event-Driven Architecture
The codebase uses EventEmitter patterns extensively. Copilot can help with:
- Creating and managing event listeners
- Implementing custom events
- Async/await patterns with events
- Event cleanup and memory management

### 4. Geolocation and Mapping
Copilot can assist with:
- Leaflet map initialization and configuration
- Marker placement and clustering
- Geolocation tracking
- Distance calculations using earth-distance-js
- Custom map layers and overlays

### 5. Data Management
Copilot understands:
- LokiJS database operations
- JSON/JSON5 parsing
- CSV export functionality
- JSONPath queries
- Data filtering and transformation

## Best Practices

### Code Style
Follow the existing patterns in the codebase:
```javascript
// Use const for immutable references
const debug = require('debug')('module-name')

// Use async/await for asynchronous operations
async function fetchData() {
  const result = await someAsyncOperation()
  return result
}

// Use ES6 imports where appropriate
import { ModuleName } from './module'

// Use require for CommonJS modules
const moment = require('moment')
```

### Naming Conventions
- **Classes**: PascalCase (e.g., `RFParty`, `MainWindow`)
- **Functions**: camelCase (e.g., `scanDevices`, `parseAdvertisement`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `TILE_SERVER_MAPBOX`)
- **Private methods**: Prefix with underscore (e.g., `_internalMethod`)

### Documentation
When adding new features, include:
- JSDoc comments for public APIs
- Inline comments for complex BLE parsing logic
- README updates for new user-facing features
- Example usage in comments

## Limitations and Considerations

### What Copilot May Not Handle Well

1. **Cordova Plugin Configuration**
   - Plugin-specific XML configuration in `config.xml`
   - Platform-specific build settings
   - Native Android/iOS code modifications
   
2. **BLE Hardware Specifics**
   - Device-specific BLE quirks
   - Manufacturer-specific advertisement formats not in standard tables
   - Platform-specific BLE scanning limitations

3. **Build and Deployment**
   - Parcel.js configuration nuances
   - Android SDK setup
   - Release signing and deployment

4. **Testing**
   - Hardware-dependent BLE testing
   - Cordova device testing
   - Platform-specific behavior

### When to Verify Copilot Suggestions

Always review and test Copilot suggestions for:
- **Security-sensitive code**: Permission handling, data sanitization
- **BLE operations**: Ensure correct byte ordering and parsing
- **Memory management**: Check for event listener cleanup
- **Async operations**: Verify error handling and promise chains
- **Cordova lifecycle**: Ensure proper device ready handling

## Workflow Integration

### Development Workflow
1. **Feature Development**
   - Use Copilot for boilerplate code generation
   - Review suggestions against existing patterns
   - Test on actual Android devices when possible

2. **Code Review**
   - Use Copilot to understand unfamiliar code sections
   - Generate test cases for new features
   - Identify potential issues or improvements

3. **Debugging**
   - Ask Copilot to explain complex BLE parsing logic
   - Generate debugging statements
   - Suggest alternative implementations

4. **Refactoring**
   - Modernize callback-based code to async/await
   - Extract reusable functions
   - Improve code organization

### Linting Before Commit
Always run the linter before committing:
```bash
npm run lint
```

Copilot can help fix linting errors automatically by suggesting corrections.

## Example Use Cases

### 1. Adding a New BLE Parser
```javascript
// Ask Copilot: "Create a parser for Eddystone beacon advertisements"
// Copilot will suggest a function based on existing parser patterns
```

### 2. Implementing a New Feature
```javascript
// Ask Copilot: "Add a filter to show only devices with strong signal (RSSI > -60)"
// Copilot understands the existing filtering patterns
```

### 3. Debugging BLE Issues
```javascript
// Ask Copilot: "Explain what this BLE advertisement data means: 0x02010612FF..."
// Copilot can break down the byte structure
```

### 4. Optimizing Performance
```javascript
// Ask Copilot: "Optimize this scanning loop to reduce battery consumption"
// Copilot can suggest throttling or debouncing techniques
```

## Resources for Developers

### Internal Documentation
- **README.md**: Installation and build instructions
- **package.json**: Scripts and dependencies
- **.eslintrc**: Code style rules
- **src/parsers/**: BLE advertisement parser implementations

### External Resources
- [GitHub Copilot Documentation](https://docs.github.com/en/copilot)
- [Cordova Documentation](https://cordova.apache.org/docs/en/latest/)
- [BLE Specification](https://www.bluetooth.com/specifications/specs/)
- [Leaflet Documentation](https://leafletjs.com/)

## Troubleshooting

### Copilot Not Providing Good Suggestions?
1. **Add more context**: Include relevant imports and type hints
2. **Use descriptive names**: Clear variable and function names help Copilot
3. **Add comments**: Explain what you're trying to achieve
4. **Reference existing code**: Look at similar implementations in the codebase

### Copilot Suggesting Incompatible Code?
1. **Check Node.js version**: Ensure Copilot targets correct ECMAScript version
2. **Review imports**: Verify Copilot uses correct module system (ES6 vs CommonJS)
3. **Test thoroughly**: Always test Copilot suggestions, especially for async code

## Feedback and Improvements

If you encounter issues or have suggestions for improving Copilot usage in this repository:
- Open an issue with the tag `copilot-feedback`
- Share particularly helpful Copilot patterns with the team
- Document new use cases in this file

## Security Considerations

When using Copilot:
- **Never commit sensitive data**: API keys, tokens, or credentials
- **Review permission requests**: Ensure BLE and location permissions are appropriate
- **Validate external data**: Always sanitize BLE advertisement data
- **Check dependencies**: Review Copilot-suggested dependencies for vulnerabilities

---

*Last updated: January 2026*
