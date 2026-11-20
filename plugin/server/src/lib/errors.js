/**
 * Error raised for problems the user (or the assistant) can fix, such as an unknown
 * account or an invalid date. Its message is shown back to the assistant as is.
 */
export class UserError extends Error {
  /**
   * @param {string} message
   * @param {Record<string, unknown>} [details]
   */
  constructor(message, details) {
    super(message);
    this.name = 'UserError';
    this.details = details;
  }
}

/**
 * @param {boolean} condition
 * @param {string} message
 * @param {Record<string, unknown>} [details]
 */
export function ensure(condition, message, details) {
  if (!condition) throw new UserError(message, details);
}
