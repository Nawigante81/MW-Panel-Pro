export const withRetry = async (fn, { retries = 2, backoffMs = 500 } = {}) => {
  let lastError;
  for (let i = 0; i <= retries; i += 1) {
    try {
      return await fn(i);
    } catch (error) {
      lastError = error;
      if (i >= retries) break;
      const delay = backoffMs * Math.pow(2, i);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
};
