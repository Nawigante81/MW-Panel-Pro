import { CollectedOfferSchema } from '../types/offer.js';

export const normalizePropertyOffer = (input) => {
  return CollectedOfferSchema.parse(input);
};
