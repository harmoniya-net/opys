import { z } from 'zod';

export interface JavaVersion {
  readonly component: string;
  readonly majorVersion: number;
}

export const JavaVersionSchema = z
  .object({ component: z.string(), majorVersion: z.number() })
  .default({ component: 'jre-legacy', majorVersion: 8 });
