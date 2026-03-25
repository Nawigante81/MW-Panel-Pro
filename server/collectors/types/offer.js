import { z } from 'zod';

export const CollectedOfferSchema = z.object({
  source: z.string().min(1),
  external_id: z.string().min(1).optional(),
  source_url: z.string().url().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  price: z.number().nonnegative().optional(),
  currency: z.string().max(10).optional(),
  area_m2: z.number().nonnegative().optional(),
  rooms: z.number().nonnegative().optional(),
  market_type: z.string().optional(),
  offer_type: z.string().optional(),
  property_type: z.string().optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  street: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  images: z.array(z.string()).optional(),
  contact_name: z.string().optional(),
  contact_phone: z.string().optional(),
  agency_name: z.string().optional(),
  published_at: z.string().optional(),
  scraped_at: z.string().optional(),
  fingerprint: z.string().optional(),
  raw_payload: z.any().optional(),
});

export const CollectedOfferListSchema = z.array(CollectedOfferSchema);
