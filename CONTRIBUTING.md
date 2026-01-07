# Contributing to RFParty Mobile

Thank you for your interest in contributing to RFParty Mobile! This document provides guidelines and information for contributors.

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- Android SDK (for building Android apps)
- Java Development Kit (JDK 8 or higher)
- An Android device or emulator for testing

### Setup
1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/rfparty-mobile-fork.git
   cd rfparty-mobile-fork
   ```
3. Install dependencies:
   ```bash
   npm install
   npm run init
   ```
4. Add the Android platform:
   ```bash
   npx cordova platform add android
   ```

## Development Workflow

### Before You Start
1. Create a feature branch: `git checkout -b feature/your-feature-name`
2. Check existing issues and pull requests to avoid duplicates
3. Review the codebase to understand existing patterns

### Making Changes
1. **Write clean code**: Follow the existing code style
2. **Lint your code**: Run `npm run lint` before committing
3. **Test thoroughly**: Test on real Android devices when possible
4. **Keep commits atomic**: One logical change per commit
5. **Write meaningful commit messages**: Describe what and why, not how

### Testing
- Test BLE functionality on real Android devices
- Verify UI changes on different screen sizes
- Check battery impact for background operations
- Test permission flows on different Android versions

### Code Style
- Follow ESLint rules defined in `.eslintrc`
- Use ES6+ features (async/await, arrow functions, destructuring)
- Use meaningful variable and function names
- Add comments for complex BLE parsing logic
- Keep functions small and focused

## GitHub Copilot for Contributors

### Availability
GitHub Copilot is enabled for this repository. If you have Copilot access, you can use it to assist with development.

### Using Copilot Effectively
- **Read [COPILOT.md](/COPILOT.md)**: Comprehensive guide on using Copilot with this codebase
- **Understand the context**: Copilot works best when you understand what you're building
- **Review suggestions**: Always review and test Copilot's suggestions
- **Follow patterns**: Copilot learns from existing code, so maintaining consistency helps

### What Copilot Can Help With
- Understanding BLE protocols and parsing advertisement data
- Working with Cordova plugin APIs
- Implementing event-driven patterns
- Generating boilerplate code
- Writing documentation
- Debugging and refactoring

### When to Be Cautious
- Security-sensitive code (permissions, data validation)
- Hardware-specific BLE operations
- Build and deployment configuration
- Platform-specific native code

For detailed Copilot usage, see [COPILOT.md](/COPILOT.md).

## Submitting Changes

### Pull Request Process
1. **Update documentation**: If you change functionality, update README or relevant docs
2. **Run the linter**: Ensure `npm run lint` passes
3. **Test your changes**: Verify everything works on Android device
4. **Write a clear PR description**:
   - What problem does this solve?
   - What changes did you make?
   - How to test the changes?
   - Screenshots for UI changes

### PR Guidelines
- Keep PRs focused on a single feature or bug fix
- Link related issues with "Fixes #123" or "Relates to #456"
- Respond to code review feedback promptly
- Be open to suggestions and discussion

### Code Review
- All PRs require review before merging
- Maintainers may suggest changes or improvements
- Be respectful and constructive in discussions
- Reviews help improve code quality and share knowledge

## Areas for Contribution

### Good First Issues
Look for issues labeled `good first issue` - these are great starting points for new contributors.

### Priority Areas
- **BLE Parsers**: Add support for new device types and manufacturer formats
- **UI/UX**: Improve user interface and user experience
- **Performance**: Optimize scanning and rendering performance
- **Documentation**: Improve guides, examples, and code comments
- **Testing**: Add automated tests where possible
- **Accessibility**: Improve app accessibility features

### Ideas for Enhancement
- Support for more BLE device types
- Additional map features and visualizations
- Data export in different formats
- Better background scanning management
- Integration with other services
- Performance optimizations

## Reporting Issues

### Bug Reports
Include:
- **Description**: Clear description of the bug
- **Steps to reproduce**: Detailed steps to trigger the bug
- **Expected behavior**: What should happen
- **Actual behavior**: What actually happens
- **Environment**: Android version, device model, app version
- **Screenshots/logs**: If applicable

### Feature Requests
Include:
- **Use case**: Why is this feature needed?
- **Description**: What should the feature do?
- **Examples**: How would it work?
- **Alternatives**: Other solutions you considered

## Community Guidelines

### Code of Conduct
- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Respect different perspectives and experiences

### Communication
- Use GitHub issues for bugs and features
- Be clear and concise in communications
- Search existing issues before creating new ones
- Stay on topic in discussions

## Resources

### Documentation
- **README.md**: Installation and usage instructions
- **[COPILOT.md](/COPILOT.md)**: GitHub Copilot usage guide
- **[.github/copilot-instructions.md](/.github/copilot-instructions.md)**: Copilot context for this repo

### External Resources
- [Cordova Documentation](https://cordova.apache.org/docs/en/latest/)
- [Bluetooth Core Specification](https://www.bluetooth.com/specifications/specs/)
- [Parcel.js Documentation](https://parceljs.org/docs/)
- [Leaflet Documentation](https://leafletjs.com/)

### Getting Help
- Open an issue for bugs or questions
- Check existing issues and PRs for similar problems
- Review the codebase for examples

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (Apache-2.0).

## Recognition

Contributors are recognized in:
- Git commit history
- GitHub contributors page
- Release notes for significant contributions

Thank you for contributing to RFParty Mobile! Your efforts help make BLE technology more accessible and understandable for everyone.
