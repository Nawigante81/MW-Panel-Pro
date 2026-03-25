const buckets = new Map();

export const rateLimit = async (key, { perMinute = 60 } = {}) => {
  const now = Date.now();
  const bucket = buckets.get(key) || { count: 0, resetAt: now + 60_000 };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + 60_000;
  }
  bucket.count += 1;
  buckets.set(key, bucket);
  if (bucket.count <= perMinute) return;
  const waitMs = Math.max(0, bucket.resetAt - now);
  await new Promise((resolve) => setTimeout(resolve, waitMs));
};
