export class HttpError extends Error {
  status: number;
  /**
   * Machine-readable reason for the client, e.g. "MAINTENANCE".
   */
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
