import { isIsoDate } from './dates.js';

/**
 * Minimal JSON Schema validator covering the subset used by the tool definitions:
 * type, properties, required, additionalProperties, items, enum, minimum, maximum,
 * minLength, maxLength, pattern, minItems, maxItems and format "date".
 *
 * @param {Record<string, any>} schema
 * @param {unknown} value
 * @param {string} [path]
 * @returns {string[]} list of human readable errors (empty when valid)
 */
export function validateSchema(schema, value, path = 'input') {
  const errors = [];
  if (!schema) return errors;

  if (value === undefined || value === null) {
    if (schema.nullable && value === null) return errors;
    if (value === null && Array.isArray(schema.type) && schema.type.includes('null')) return errors;
  }

  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (types.length > 0 && !types.some((type) => matchesType(type, value))) {
    errors.push(`${path}: expected ${types.join(' or ')}`);
    return errors;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: must be one of ${schema.enum.join(', ')}`);
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: too short`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: too long`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: invalid format`);
    if (schema.format === 'date' && !isIsoDate(value)) errors.push(`${path}: expected a date in YYYY-MM-DD`);
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: must be <= ${schema.maximum}`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: too few items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: too many items`);
    if (schema.items) {
      value.forEach((item, index) => errors.push(...validateSchema(schema.items, item, `${path}[${index}]`)));
    }
  }

  if (isPlainObject(value) && (schema.properties || schema.required)) {
    for (const key of schema.required ?? []) {
      if (value[key] === undefined) errors.push(`${path}.${key}: is required`);
    }
    for (const [key, child] of Object.entries(value)) {
      const childSchema = schema.properties?.[key];
      if (childSchema) {
        errors.push(...validateSchema(childSchema, child, `${path}.${key}`));
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}.${key}: unknown field`);
      }
    }
  }

  return errors;
}

function matchesType(type, value) {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return isPlainObject(value);
    case 'null':
      return value === null;
    default:
      return false;
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
