export class FreightError extends Error {
  constructor({ code, level, message, details = {} }) {
    super(message);
    this.name = 'FreightError';
    this.code = code;
    this.level = level;
    this.details = details;
  }

  toJSON() {
    return {
      ok: false,
      code: this.code,
      level: this.level,
      message: this.message,
      details: this.details
    };
  }
}

export function isFreightError(error) {
  return error instanceof FreightError;
}
