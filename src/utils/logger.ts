export const logger = {
  info: (message: string, ...optionalParams: any[]) => {
    const timestamp = new Date().toISOString();
    console.log(`\x1b[32m[INFO] [${timestamp}]\x1b[0m ${message}`, ...optionalParams);
  },
  warn: (message: string, ...optionalParams: any[]) => {
    const timestamp = new Date().toISOString();
    console.warn(`\x1b[33m[WARN] [${timestamp}]\x1b[0m ${message}`, ...optionalParams);
  },
  error: (message: string, ...optionalParams: any[]) => {
    const timestamp = new Date().toISOString();
    console.error(`\x1b[31m[ERROR] [${timestamp}]\x1b[0m ${message}`, ...optionalParams);
  },
  debug: (message: string, ...optionalParams: any[]) => {
    const timestamp = new Date().toISOString();
    console.debug(`\x1b[36m[DEBUG] [${timestamp}]\x1b[0m ${message}`, ...optionalParams);
  }
};
