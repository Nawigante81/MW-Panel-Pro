import { runSource } from './run_source.js';

export const runAll = async (collectors = []) => {
  const results = [];
  for (const collector of collectors) {
    if (!collector?.config?.enabled) continue;
    const result = await runSource(collector);
    results.push({ source: collector.source, ...result });
  }
  return results;
};
