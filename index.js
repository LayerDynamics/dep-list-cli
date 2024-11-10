#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import fg from "fast-glob";
import { Command } from "commander";
import { parse } from "@babel/parser";
import chalk from "chalk";
import { fileURLToPath } from "url";
import { dirname } from "path";
import ignore from "ignore";

/**
 * Recursively traverses the Abstract Syntax Tree (AST) and executes visitor functions based on node types.
 *
 * @param {Object} node - The current AST node.
 * @param {Object} visitors - An object containing visitor functions keyed by node type.
 * @param {Set} [visited=new Set()] - A set to track visited nodes and prevent infinite recursion.
 */
function traverseAST(node, visitors, visited = new Set()) {
	if (!node || typeof node.type !== "string" || visited.has(node)) return;
	visited.add(node);

	// Execute visitor function for the current node type, if it exists
	const visitor = visitors[node.type];
	if (visitor) {
		visitor(node);
	}

	// Recursively traverse child nodes
	for (const key in node) {
		if (key === "loc" || key === "range") continue; // Skip location information

		const child = node[key];
		if (Array.isArray(child)) {
			child.forEach((c) => traverseAST(c, visitors, visited));
		} else if (typeof child === "object" && child !== null && child.type) {
			traverseAST(child, visitors, visited);
		}
	}
}

// Handle __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirnamePath = dirname(__filename);

/**
 * Internal ignore patterns to exclude specific directories and file types from scanning.
 */
const internalIgnorePatterns = [
	"**/node_modules/**", // Exclude all node_modules directories
	"**/*.d.ts", // Exclude all TypeScript declaration files
	"dist",
	"build",
	".env",
	".DS_Store",
	"*.log",
	"coverage",
];

/**
 * Patterns to identify dev files (e.g., test files, scripts) across sub-projects.
 */
const devFilePatterns = [
	"**/test/**/*.{js,jsx,ts,tsx}",
	"**/__tests__/**/*.{js,jsx,ts,tsx}",
	"**/tests/**/*.{js,jsx,ts,tsx}",
	"**/scripts/**/*.{js,jsx,ts,tsx}",
	"**/*.test.{js,jsx,ts,tsx}",
	"**/*.spec.{js,jsx,ts,tsx}",
	"**/__mocks__/**/*.{js,jsx,ts,tsx}",
	"**/__fixtures__/**/*.{js,jsx,ts,tsx}",
	"**/setupTests.{js,jsx,ts,tsx}",
];

/**
 * Checks if a file exists at the given path.
 *
 * @param {string} filePath - The path to the file.
 * @returns {Promise<boolean>} - Resolves to true if the file exists, otherwise false.
 */
async function fileExists(filePath) {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Reads and combines all relevant ignore patterns, including those from .gitignore files.
 *
 * @param {string} projectRoot - The root directory of the project.
 * @returns {Promise<ignore.Ignore>} - An instance of ignore with combined patterns.
 */
async function getIgnoreInstance(projectRoot) {
	const ig = ignore();
	ig.add(internalIgnorePatterns);

	// Find all .gitignore files recursively
	const gitignorePaths = await fg("**/.gitignore", {
		cwd: projectRoot,
		ignore: internalIgnorePatterns.concat("**/node_modules/**"),
		onlyFiles: true,
		absolute: true,
	});

	// Read and add patterns from each .gitignore
	for (const gitignorePath of gitignorePaths) {
		try {
			const gitignoreContent = await fs.readFile(gitignorePath, "utf8");
			const gitignorePatterns = gitignoreContent
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line && !line.startsWith("#")); // Remove empty lines and comments
			ig.add(gitignorePatterns);
			console.log(
				chalk.blue(
					`Loaded patterns from ${path.relative(projectRoot, gitignorePath)}`,
				),
			);
		} catch (error) {
			console.error(
				chalk.red(`Failed to read ${gitignorePath}: ${error.message}`),
			);
		}
	}

	return ig;
}

/**
 * Parses a file and extracts its dependencies.
 *
 * @param {string} filePath - The path to the file.
 * @returns {Promise<string[]>} - An array of dependency names.
 */
async function extractDependencies(filePath) {
	let dependencies = [];

	try {
		const content = await fs.readFile(filePath, "utf8");

		// Parse the file content into an AST
		const ast = parse(content, {
			sourceType: "unambiguous", // Automatically determines module type (ESM or CommonJS)
			plugins: [
				"jsx",
				"typescript",
				"dynamicImport",
				"importMeta",
				"classProperties", // Add additional plugins as needed
				// 'decorators-legacy' // Uncomment if using decorators
			],
		});

		// Traverse the AST and collect dependencies
		traverseAST(ast, {
			/**
			 * Handles import declarations: import ... from 'package'
			 *
			 * @param {Object} node - The ImportDeclaration AST node.
			 */
			ImportDeclaration(node) {
				if (node.source?.value) {
					dependencies.push(node.source.value);
				}
			},

			/**
			 * Handles require statements: const x = require('package')
			 *
			 * @param {Object} node - The CallExpression AST node.
			 */
			CallExpression(node) {
				if (
					node.callee?.name === "require" &&
					node.arguments?.length === 1 &&
					node.arguments[0]?.type === "StringLiteral"
				) {
					dependencies.push(node.arguments[0].value);
				}
			},

			/**
			 * Handles dynamic imports: import('package')
			 *
			 * @param {Object} node - The Import AST node.
			 */
			Import(node) {
				if (
					node.arguments?.length === 1 &&
					node.arguments[0]?.type === "StringLiteral"
				) {
					dependencies.push(node.arguments[0].value);
				}
			},

			/**
			 * Handles export declarations with from: export ... from 'package'
			 *
			 * @param {Object} node - The ExportNamedDeclaration AST node.
			 */
			ExportNamedDeclaration(node) {
				if (node.source?.value) {
					dependencies.push(node.source.value);
				}
			},

			/**
			 * Handles export all declarations: export * from 'package'
			 *
			 * @param {Object} node - The ExportAllDeclaration AST node.
			 */
			ExportAllDeclaration(node) {
				if (node.source?.value) {
					dependencies.push(node.source.value);
				}
			},
		});
	} catch (error) {
		console.error(chalk.red(`Failed to parse ${filePath}: ${error.message}`));
	}

	return dependencies;
}

/**
 * Resolves the package name from a dependency path.
 *
 * @param {string} dep - The dependency path.
 * @returns {string|null} - The package name or null if it's a local module.
 */
function getPackageName(dep) {
	// Ignore local modules (relative or absolute paths)
	if (dep.startsWith(".") || dep.startsWith("/")) {
		return null;
	}

	// Handle scoped packages or regular packages
	const parts = dep.split("/");
	if (dep.startsWith("@")) {
		return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : dep;
	} else {
		return parts[0];
	}
}

/**
 * Scans a directory for package.json files, excluding node_modules and other ignored patterns.
 *
 * @param {string} rootDir - The root directory to scan.
 * @param {ignore.Ignore} ig - The ignore instance to filter package.json files.
 * @returns {Promise<Object[]>} - An array of project objects containing package.json paths and names.
 */
async function findProjects(rootDir, ig) {
	const projectGlob = `**/package.json`;

	const packageJsonPaths = await fg(projectGlob, {
		cwd: rootDir,
		ignore: ["**/node_modules/**"],
		onlyFiles: true,
		absolute: true,
	});

	const projects = [];

	await Promise.all(
		packageJsonPaths.map(async (pkgPath) => {
			// Check if the package.json path is ignored
			const relativePath = path.relative(rootDir, pkgPath);
			if (ig.ignores(relativePath)) {
				return;
			}

			try {
				const pkgContent = await fs.readFile(pkgPath, "utf8");
				const pkgJson = JSON.parse(pkgContent);
				const projectName =
					pkgJson.name || path.basename(path.dirname(pkgPath));
				projects.push({
					name: projectName,
					path: path.dirname(pkgPath),
					packageJsonPath: pkgPath,
				});
			} catch (error) {
				console.error(
					chalk.red(`Failed to read or parse ${pkgPath}: ${error.message}`),
				);
			}
		}),
	);

	return projects;
}

// Setup Commander CLI
const program = new Command();

/**
 * Configures the CLI commands, options, and help text.
 */
program
	.name("dep-list-cli")
	.description("CLI tool to list npm packages used in project files")
	.version("1.3.0")
	.option("-c, --command", "Output as npm install commands")
	.on("--help", () => {
		console.log("");
		console.log("Examples:");
		console.log("  $ dep-list-cli");
		console.log("  $ dep-list-cli --command");
		console.log("  $ npx dep-list-cli --command");
	})
	.parse(process.argv);

const options = program.opts();
const projectRoot = process.cwd();

/**
 * Defines the file extensions to consider when scanning for dependencies.
 */
const fileExtensions = ["js", "jsx", "ts", "tsx"];

/**
 * Creates the glob pattern for main dependency files.
 */
const mainPattern = `**/*.{${fileExtensions.join(",")}}`;

/**
 * Collects dependencies from a list of files.
 *
 * @param {string[]} files - An array of file paths.
 * @param {boolean} [categorizeAsDev=false] - Whether to categorize dependencies as devDependencies.
 * @param {ignore.Ignore} ig - The ignore instance to filter files.
 * @returns {Promise<Object[]>} - An array of dependency objects.
 */
async function collectDependencies(files, categorizeAsDev = false, ig) {
	const dependencies = [];

	// Filter out ignored files using the ignore instance
	const relativeFiles = files.map((file) => path.relative(projectRoot, file));
	const filteredFiles = ig
		.filter(relativeFiles)
		.map((relative) => path.join(projectRoot, relative));

	await Promise.all(
		filteredFiles.map(async (file) => {
			const deps = await extractDependencies(file);
			deps.forEach((dep) => {
				const pkg = getPackageName(dep);
				if (pkg) {
					dependencies.push({ pkg, dev: categorizeAsDev });
				}
			});
		}),
	);

	return dependencies;
}

/**
 * Removes duplicates and categorizes dependencies into regular and dev.
 *
 * @param {Object[]} allDeps - An array of dependency objects.
 * @returns {Object} - An object containing arrays of regular and dev dependencies.
 */
function categorizeDependencies(allDeps) {
	const regularDeps = new Set();
	const devDeps = new Set();

	allDeps.forEach(({ pkg, dev }) => {
		if (dev) {
			devDeps.add(pkg);
		} else {
			regularDeps.add(pkg);
		}
	});

	// Remove dev dependencies from regular if overlap exists
	devDeps.forEach((dep) => {
		if (regularDeps.has(dep)) {
			regularDeps.delete(dep);
		}
	});

	return {
		regular: Array.from(regularDeps).sort(),
		dev: Array.from(devDeps).sort(),
	};
}

/**
 * Formats an array of dependencies into a space-separated string.
 *
 * @param {string[]} deps - An array of dependency names.
 * @returns {string} - A space-separated string of dependencies.
 */
function formatDeps(deps) {
	return deps.join(" ");
}

/**
 * Main function to execute the CLI logic.
 */
async function main() {
	try {
		const ig = await getIgnoreInstance(projectRoot);

		// Find all projects (package.json files) in the project root
		const projects = await findProjects(projectRoot, ig);

		if (projects.length === 0) {
			console.log(chalk.yellow("No package.json files found."));
			process.exit(0);
		}

		// Iterate over each project to collect and display dependencies
		for (const project of projects) {
			const { name, path: projectPath } = project;

			// Define glob options for main files (regular dependencies)
			const mainGlobOptions = {
				cwd: projectPath,
				ignore: [...devFilePatterns, ...internalIgnorePatterns], // Include dev and internal ignores
				dot: true,
				onlyFiles: true,
				absolute: true,
			};

			// Define glob options for dev files (dev dependencies)
			const devGlobOptions = {
				cwd: projectPath,
				ignore: [...internalIgnorePatterns], // Exclude node_modules and other internal ignores
				dot: true,
				onlyFiles: true,
				absolute: true,
			};

			// Retrieve file lists for regular and dev dependencies
			const [mainFiles, devFiles] = await Promise.all([
				fg(mainPattern, mainGlobOptions),
				fg(devFilePatterns, devGlobOptions),
			]);

			// Collect dependencies from the respective file lists
			const [regularDeps, devDeps] = await Promise.all([
				collectDependencies(mainFiles, false, ig),
				collectDependencies(devFiles, true, ig),
			]);

			// Combine and categorize all dependencies
			const allDependencies = [...regularDeps, ...devDeps];
			const categorized = categorizeDependencies(allDependencies);

			// Handle cases with no dependencies found for the project
			if (categorized.regular.length === 0 && categorized.dev.length === 0) {
				console.log(
					chalk.yellow(
						`No external dependencies found for project "${name}".\n`,
					),
				);
				continue;
			}

			// Output dependencies based on the --command flag
			if (options.command) {
				console.log(chalk.bold(`${chalk.green("Project:")} ${name}`));

				if (categorized.regular.length > 0) {
					console.log(
						chalk.green.bold("Regular Dependencies:"),
						"\n",
						chalk.green(`npm install ${formatDeps(categorized.regular)}`),
					);
				}

				if (categorized.dev.length > 0) {
					console.log(""); // Blank line
					console.log(
						chalk.blue.bold("Dev Dependencies:"),
						"\n",
						chalk.blue(`npm install -D ${formatDeps(categorized.dev)}`),
					);
				}

				console.log("\n"); // Extra blank line between projects
			} else {
				// Default output without the --command flag
				console.log(chalk.bold(`${chalk.green("Project:")} ${name}`));

				if (categorized.regular.length > 0) {
					console.log(chalk.green("Regular Dependencies:"));
					categorized.regular.forEach((dep) => console.log(`- ${dep}`));
				} else {
					console.log(chalk.yellow("No regular dependencies found."));
				}

				if (categorized.dev.length > 0) {
					console.log(chalk.blue("\nDev Dependencies:"));
					categorized.dev.forEach((dep) => console.log(`- ${dep}`));
				} else {
					console.log(chalk.yellow("No dev dependencies found."));
				}

				console.log("\n"); // Extra blank line between projects
			}
		}
	} catch (err) {
		console.error(chalk.red(`Error: ${err.message}`));
		process.exit(1);
	}
}

// Execute the main function
main();
