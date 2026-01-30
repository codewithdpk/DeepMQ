# Contributing to DeepMQ

Thank you for your interest in contributing to DeepMQ! This document provides guidelines and information for contributors.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## Getting Started

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm or yarn
- Git

### Development Setup

1. Fork the repository on GitHub

2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/deepmq.git
   cd deepmq
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Build the project:
   ```bash
   npm run build
   ```

5. Run tests:
   ```bash
   npm test
   ```

### Development Workflow

1. Create a feature branch:
   ```bash
   git checkout -b feature/my-feature
   ```

2. Make your changes

3. Run the build and tests:
   ```bash
   npm run build
   npm test
   ```

4. Commit your changes:
   ```bash
   git commit -m "Add my feature"
   ```

5. Push to your fork:
   ```bash
   git push origin feature/my-feature
   ```

6. Open a Pull Request

## Project Structure

```
deepMQ/
├── src/
│   ├── protocol/      # AMQP protocol implementation
│   ├── core/          # Core entities (connection, channel, queue, etc.)
│   ├── routing/       # Message routing logic
│   ├── persistence/   # Storage layer
│   ├── events/        # Event system
│   ├── cli/           # Command-line interface
│   ├── server.ts      # Main broker class
│   └── index.ts       # Public exports
├── tests/
│   └── integration/   # Integration tests
├── docs/              # Documentation
└── dist/              # Compiled output
```

## Coding Guidelines

### TypeScript

- Use TypeScript strict mode
- Provide explicit types for function parameters and return values
- Use interfaces for object shapes
- Avoid `any` type when possible

### Code Style

- Use 2-space indentation
- Use single quotes for strings
- Add trailing semicolons
- Maximum line length of 100 characters
- Use meaningful variable and function names

### File Naming

- Use kebab-case for file names: `frame-parser.ts`
- Use PascalCase for class names: `FrameParser`
- Use camelCase for functions and variables: `parseFrame`

### Comments

- Add JSDoc comments for public APIs
- Use inline comments sparingly, for complex logic
- Keep comments up-to-date with code changes

### Error Handling

- Use specific error types when possible
- Include helpful error messages
- Don't swallow errors silently

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- dist/tests/integration/amqp-client.test.js
```

### Writing Tests

- Place integration tests in `tests/integration/`
- Use descriptive test names
- Test both success and failure cases
- Clean up resources in test teardown

### Test Structure

```typescript
import { describe, it, before, after } from 'node:test';
import * as assert from 'assert';

describe('Feature', () => {
  before(async () => {
    // Setup
  });

  after(async () => {
    // Teardown
  });

  it('should do something', async () => {
    // Test logic
    assert.strictEqual(actual, expected);
  });
});
```

## Pull Request Guidelines

### Before Submitting

- [ ] Code builds without errors (`npm run build`)
- [ ] All tests pass (`npm test`)
- [ ] New features include tests
- [ ] Documentation is updated if needed
- [ ] Commit messages are clear and descriptive

### PR Description

Include in your PR description:
- What changes were made
- Why the changes were made
- How to test the changes
- Any breaking changes

### Review Process

1. Maintainers will review your PR
2. Address any feedback or requested changes
3. Once approved, your PR will be merged

## Feature Requests

### Suggesting Features

1. Check existing issues for similar requests
2. Open a new issue with the "enhancement" label
3. Describe the feature and its use case
4. Explain why it would benefit the project

### Implementing Features

Before implementing a significant feature:
1. Open an issue to discuss the approach
2. Wait for feedback from maintainers
3. Reference the issue in your PR

## Bug Reports

### Reporting Bugs

1. Check existing issues for duplicates
2. Open a new issue with the "bug" label
3. Include:
   - DeepMQ version
   - Node.js version
   - Operating system
   - Steps to reproduce
   - Expected vs actual behavior
   - Error messages or logs

### Fixing Bugs

1. Reference the issue in your PR
2. Include a test that reproduces the bug
3. Verify the fix resolves the issue

## Areas for Contribution

### Good First Issues

Look for issues labeled "good first issue" for beginner-friendly tasks.

### Priority Areas

- **TLS/SSL Support** - Secure connections
- **Management API** - HTTP API for monitoring
- **Dead Letter Exchanges** - Handle failed messages
- **Message TTL** - Automatic message expiration
- **Headers Exchange** - Route by message headers
- **Performance** - Optimization and benchmarking
- **Documentation** - Improvements and examples

## Release Process

Releases are managed by maintainers:

1. Version bump in `package.json`
2. Update CHANGELOG.md
3. Create git tag
4. Publish to npm

## Getting Help

- Open an issue for questions
- Check existing documentation
- Review closed issues for solutions

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
