import { cleanupInactive } from '../storage/offer_repository.js';

export const runCleanup = ({ olderThanDays = 7 } = {}) => {
  return cleanupInactive({ olderThanDays });
};
