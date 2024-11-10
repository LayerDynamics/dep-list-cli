# dep-list-cli

[![npm version](https://img.shields.io/npm/v/dep-list-cli.svg)](https://www.npmjs.com/package/dep-list-cli)
[![license](https://img.shields.io/npm/l/dep-list-cli.svg)](https://github.com/LayerDynamics/dep-list-cli/blob/main/LICENSE)

A CLI tool to list npm packages used in your project files. It scans your JavaScript and TypeScript files to extract dependencies, categorizes them into regular and dev dependencies, and outputs them in a readable format or as npm install commands.

- **Author:** Ryan O'Boyle
- **Email:** [layerdynamics@proton.me](mailto:layerdynamics@proton.me)
- **Repository:** [LayerDynamics/dep-list-cli](https://github.com/LayerDynamics/dep-list-cli.git)

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
  - [Basic Usage](#basic-usage)
  - [As NPM Install Commands](#as-npm-install-commands)
  - [Using NPX](#using-npx)
- [Examples](#examples)
- [How It Works](#how-it-works)
- [Contributing](#contributing)
- [License](#license)

## Features

- Scans JavaScript (`.js`, `.jsx`) and TypeScript (`.ts`, `.tsx`) files.
- Extracts dependencies from `import`, `require`, and dynamic imports.
- Categorizes dependencies into regular and dev dependencies.
- Respects `.gitignore` and internal ignore patterns.
- Outputs dependencies in a readable list or as `npm install` commands.
- Supports monorepos with multiple `package.json` files.

## Installation

You can install `dep-list-cli` globally using npm:

```bash
npm install -g dep-list-cli
```

Or use it directly with `npx` without installation:

```bash
npx dep-list-cli
```

## Usage

### Basic Usage

Run the CLI in the root directory of your project:

```bash
dep-list-cli
```

This will output the dependencies found in your project files, categorized into regular and dev dependencies.

### As NPM Install Commands

If you want the output as `npm install` commands, use the `--command` or `-c` option:

```bash
dep-list-cli --command
```

This will output commands that you can run to install the dependencies:

```bash
npm install package1 package2
npm install -D dev-package1 dev-package2
```

### Using NPX

You can use `dep-list-cli` without installing it globally by using `npx`:

```bash
npx dep-list-cli
```

Or with the `--command` option:

```bash
npx dep-list-cli --command
```

## Examples

### Example 1: Basic Usage

Running `dep-list-cli` in a project:

```bash
dep-list-cli
```

**Output:**

```
Project: my-awesome-project
Regular Dependencies:
- express
- mongoose
- react
- redux

Dev Dependencies:
- jest
- eslint
```

### Example 2: Output as NPM Install Commands

Running `dep-list-cli` with the `--command` option:

```bash
dep-list-cli --command
```

**Output:**

```
Project: my-awesome-project
Regular Dependencies:
 npm install express mongoose react redux

Dev Dependencies:
 npm install -D jest eslint
```

### Example 3: Using NPX

Using `npx` to run the CLI without installation:

```bash
npx dep-list-cli --command
```

**Output:**

```
Project: my-awesome-project
Regular Dependencies:
 npm install express mongoose react redux

Dev Dependencies:
 npm install -D jest eslint
```

## How It Works

1. **Scanning Files:**
   - The tool scans all `.js`, `.jsx`, `.ts`, and `.tsx` files in your project directories, excluding those specified in `.gitignore` and internal ignore patterns (like `node_modules`, `dist`, etc.).

2. **Extracting Dependencies:**
   - It parses each file's Abstract Syntax Tree (AST) to find dependencies imported using `import`, `require`, and dynamic imports.

3. **Categorizing Dependencies:**
   - Dependencies are categorized into:
     - **Regular Dependencies:** Used in your application's main code.
     - **Dev Dependencies:** Used in development files like tests and scripts.

4. **Outputting Results:**
   - The tool outputs the dependencies either as a list or as `npm install` commands, depending on the options used.

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository: [LayerDynamics/dep-list-cli](https://github.com/LayerDynamics/dep-list-cli.git)
2. Create your feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Create a new Pull Request

For major changes, please open an issue first to discuss what you would like to change.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

If you have any questions or need assistance, feel free to contact the author:

- **Email:** [layerdynamics@proton.me](mailto:layerdynamics@proton.me)

Happy coding!
