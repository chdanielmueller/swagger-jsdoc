import { promises as fsp, readFileSync } from 'fs';
import { createRequire } from 'module';
import { extname } from 'path';
import glob from 'glob';
import yaml from 'yaml';

/**
 * Converts an array of globs to full paths
 * @param {array} globs - Array of globs and/or normal paths
 * @return {array} Array of fully-qualified paths
 */
export function convertGlobPaths(globs) {
  return globs
    .map((globString) => glob.sync(globString))
    .reduce((previous, current) => previous.concat(current), []);
}

/**
 * Checks if there is any properties of the input object which are an empty object
 * @param {object} obj - the object to check
 * @returns {boolean}
 */
export function hasEmptyProperty(obj) {
  return Object.keys(obj)
    .map((key) => obj[key])
    .every(
      (keyObject) =>
        typeof keyObject === 'object' &&
        Object.keys(keyObject).every((key) => !(key in keyObject))
    );
}

/**
 * Extracts the YAML description from JSDoc comments with `@swagger`/`@openapi` annotation.
 * @param {object} jsDocComment - Single item of JSDoc comments from doctrine.parse
 * @returns {array} YAML parts
 */
export function extractYamlFromJsDoc(jsDocComment) {
  const yamlParts = [];

  for (const tag of jsDocComment.tags) {
    if (tag.title === 'swagger' || tag.title === 'openapi') {
      yamlParts.push(tag.description);
    }
  }

  return yamlParts;
}

/**
 * @param {string} filePath
 * @returns {{jsdoc: array, yaml: array}} JSDoc comments and Yaml files
 */
export function extractAnnotations(filePath, encoding = 'utf8') {
  const fileContent = readFileSync(filePath, { encoding });
  const ext = extname(filePath);
  const jsDocRegex = /\/\*\*([\s\S]*?)\*\//gm;
  const csDocRegex = /###([\s\S]*?)###/gm;
  const yaml = [];
  const jsdoc = [];
  let regexResults = null;

  switch (ext) {
    case '.yml':
    case '.yaml':
      yaml.push(fileContent);
      break;

    case '.coffee':
      regexResults = fileContent.match(csDocRegex) || [];
      for (const result of regexResults) {
        let part = result.split('###');
        part[0] = `/**`;
        part[part.length - 1] = '*/';
        part = part.join('');
        jsdoc.push(part);
      }
      break;

    default: {
      regexResults = fileContent.match(jsDocRegex) || [];
      for (const result of regexResults) {
        jsdoc.push(result);
      }
    }
  }

  return { yaml, jsdoc };
}

/**
 * @param {object} tag
 * @param {array} tags
 * @returns {boolean}
 */
export function isTagPresentInTags(tag, tags) {
  const match = tags.find((targetTag) => tag.name === targetTag.name);
  if (match) return true;

  return false;
}

/**
 * @param {string} definitionPath path to the swaggerDefinition
 */
export async function loadDefinition(definitionPath) {
  const loadModule = async () => {
    /**
     * Load ESM module
     * @see https://nodejs.org/api/esm.html
     *
     * `definitionPath` will be treated as an absolute specifier.
     * The relative and bare specifiers would be based on assumptions which are not stable.
     * For example, if path from cli `examples/app/parameters.*` goes in, it will be assumed as bare, which is wrong.
     */
    const esmodule = await import(definitionPath);
    return esmodule.default;
  };
  const loadCJS = () => {
    const require = createRequire(import.meta.url);
    return require(definitionPath);
  };
  const loadJson = async () => {
    const fileContents = await fsp.readFile(definitionPath);
    return JSON.parse(fileContents);
  };
  const loadYaml = async () => {
    const fileContents = await fsp.readFile(definitionPath);
    return yaml.parse(String(fileContents));
  };

  const LOADERS = {
    '.js': loadModule,
    '.mjs': loadModule,
    '.cjs': loadCJS,
    '.json': loadJson,
    '.yml': loadYaml,
    '.yaml': loadYaml,
  };

  const loader = LOADERS[extname(definitionPath)];

  if (loader === undefined) {
    throw new Error(
      `Definition file should be any of the following: ${Object.keys(
        LOADERS
      ).join(', ')}`
    );
  }

  const result = await loader();

  return result;
}

/**
 * @param {object} swaggerDefinition
 */
export function validateDefinition(swaggerDefinition) {
  if (!swaggerDefinition) {
    throw new Error('Swagger definition object is required');
  }

  if (!swaggerDefinition.info) {
    throw new Error('Definition file should contain an info object!');
  }

  if (
    !('title' in swaggerDefinition.info) ||
    !('version' in swaggerDefinition.info)
  ) {
    throw new Error(
      'Definition info object requires title and version properties!'
    );
  }

  return true;
}
