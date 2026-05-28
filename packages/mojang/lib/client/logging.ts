import { z } from 'zod';

export const LoggingFileSchema = z.object({
  id: z.string(),
  sha1: z.string(),
  size: z.number().int(),
  url: z.string(),
});

export type LoggingFile = z.infer<typeof LoggingFileSchema>;

export const LoggingClientSchema = z.object({
  argument: z.string(),
  file: LoggingFileSchema,
  type: z.string(),
});

export type LoggingClient = z.infer<typeof LoggingClientSchema>;

export const LoggingSchema = z.object({ client: LoggingClientSchema });
export type Logging = z.infer<typeof LoggingSchema>;
