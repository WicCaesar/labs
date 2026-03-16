# Contributing Guide

Thank you for considering contributing to **Vitrolinha do Tempo**! This document provides guidelines to make the contribution process clear and efficient.

## Table of Contents

- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Development Process](#development-process)
- [Code Standards](#code-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Requests](#pull-requests)
- [Questions](#questions)

## How to Contribute

There are several ways to contribute:

- **Report bugs**: Open an issue describing the problem
- **Suggest features**: Share your ideas through issues
- **Improve documentation**: Fix or expand the documentation
- **Contribute code**: Implement features or fix bugs

## Development Setup

### Prerequisites

- Node.js 18+ and npm
- Git

### Installation

1. Fork and clone the repository

   ```bash
   git clone https://github.com/your-username/vitrolinha-do-tempo.git
   cd vitrolinha-do-tempo
   ```

2. Install dependencies

   ```bash
   npm install
   ```

3. Start the development server

   ```bash
   npm run dev
   ```

   The project will be available at `http://localhost:8080`

## Development Process

1. Create a branch for your feature

   ```bash
   git checkout -b feature/feature-name
   ```

2. Make your changes

   - Write clear and well-documented code
   - Test your changes locally

3. Commit your changes

   ```bash
   git add .
   git commit -m "feat: add new functionality"
   ```

4. Push to your fork

   ```bash
   git push origin feature/feature-name
   ```

5. Open a Pull Request

## Code Standards

### TypeScript

- Use TypeScript whenever possible
- Keep functions small and focused
- Use explicit types when not obvious
- Follow the project's ESLint and Prettier configurations

### Project Structure

```
├── src/                # Source code
│   ├── game/          # Phaser game logic
│   │   ├── scenes/    # Game scenes
│   │   └── main.ts    # Main configuration
│   └── main.ts        # Entry point
├── public/            # Static files
│   └── assets/       # Game assets
├── config/           # Vite configurations
└── build/           # Production build (generated)
```

### Architecture Rules

- Keep Phaser boot/config in `src/game/main.ts` and scene logic in `src/game/scenes/*`
- Keep one Phaser scene per file, with each scene extending `Phaser.Scene`
- Keep UI state and UI rendering in React components
- Exchange data through EventBus events
- Prefer constants/enums for scene keys, EventBus event names, and asset keys

## Commit Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code formatting
- `refactor:` Code refactoring
- `test:` Adding or fixing tests
- `chore:` Maintenance tasks

### Examples

```bash
feat: add scoring system
fix: correct sprite animation bug
docs: update README with new instructions
refactor: reorganize scene structure
test: add unit tests for EventBus
```

## Pull Requests

### Checklist

Before submitting a pull request, ensure:

- [ ] The code is working locally
- [ ] Code follows the project's style guidelines
- [ ] Documentation is updated if necessary
- [ ] Commits follow the established convention
- [ ] No unnecessary files are included
- [ ] TypeScript types are properly defined

### PR Description Template

Use this template when opening a pull request:

```markdown
## Description

Brief description of the changes

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## How to Test

1. Step 1
2. Step 2
3. Expected result

## Related Issues

Closes #(issue number)
```

### Review Process

- All pull requests require review before merging
- Address review comments promptly
- Keep pull requests focused on a single concern
- Update your branch if conflicts arise with main

## Questions

If you have questions, open an issue with the `question` label or reach out through the project's communication channels.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and collaborative environment. Treat all contributors with respect and professionalism.

---

Thank you for contributing!