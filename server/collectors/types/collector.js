import { z } from 'zod';

export const CollectorConfigSchema = z.object({
  source: z.string().min(1),
  enabled: z.boolean().default(true),
  baseUrl: z.string().optional(),
  timeoutMs: z.number().int().positive().default(15000),
  rateLimitPerMinute: z.number().int().positive().default(60),
  maxRetries: z.number().int().nonnegative().default(2),
  useBrowser: z.boolean().default(false),
});
