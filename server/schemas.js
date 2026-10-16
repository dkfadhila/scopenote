import { z } from 'zod';
import { scopeSchema } from '../src/domain.js';
export const briefInput = z.object({brief:z.string().trim().min(30).max(20000)});
export const projectId = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const projectInput = z.object({
  id:projectId,visibility:z.enum(['public','private']).optional(),client:z.string().trim().min(1).max(100),project:z.string().trim().min(1).max(150),brief:z.string().max(20000),scope:scopeSchema.nullable(),
  rate:z.number().finite().min(0).max(100000000),buffer:z.number().finite().min(0).max(100),currency:z.enum(['USD','EUR','GBP','IDR']),
  source:z.enum(['example','manual','model']),model:z.string().max(150).default(''),revision:z.number().int().min(0).optional()
});
export function parseScope(text) {
  const clean=text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/,'$1');
  return scopeSchema.parse(JSON.parse(clean));
}
