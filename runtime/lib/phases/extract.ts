import { mkdir, rm, writeFile } from 'node:fs/promises';
import type { Artifact } from '@torba/core';
import { interpolate } from '@torba/core';
import { extractArchive, extractArchivePick } from '../archive';
import { ExtractionError } from '../errors';

export interface ExtractTask {
  finalPath: string;
  artifact: Artifact;
}

/** Suffix appended to an artifact's path to mark a successful extract. */
export const EXTRACT_MARKER_SUFFIX = '.torba-extracted';

export async function extractAll(
  tasks: ExtractTask[],
  vars: Record<string, string>,
): Promise<void> {
  const cleaned = new Set<string>();
  for (const { finalPath, artifact } of tasks) {
    if (!artifact.extract) continue;
    try {
      await extractArtifact(finalPath, artifact, vars, cleaned);
    } catch (err) {
      throw new ExtractionError(artifact.path, { cause: err });
    }
  }
}

async function extractArtifact(
  finalPath: string,
  artifact: Artifact,
  vars: Record<string, string>,
  cleaned: Set<string>,
): Promise<void> {
  // `extractAll` only calls this for artifacts that have extract rules.
  for (const rule of artifact.extract ?? []) {
    if (rule.kind === 'dump') {
      const targetDir = interpolate(rule.into, vars);
      if (rule.clean && !cleaned.has(targetDir)) {
        await rm(targetDir, { recursive: true, force: true });
        cleaned.add(targetDir);
      }
      await mkdir(targetDir, { recursive: true });
      await extractArchive(
        finalPath,
        targetDir,
        rule.includes,
        rule.excludes ?? ['META-INF/'],
      );
    } else if (rule.kind === 'scan') {
      const targetDir = interpolate(rule.into, vars);
      await mkdir(targetDir, { recursive: true });
      const includes = [rule.matches, ...(rule.includes ?? [])];
      await extractArchive(
        finalPath,
        targetDir,
        includes,
        rule.excludes,
        rule.strip,
      );
    } else if (rule.kind === 'pick') {
      const destPath = interpolate(rule.into, vars);
      await extractArchivePick(finalPath, rule.file, destPath);
    }
  }
  // Marker is written only after every rule for this artifact has
  // succeeded — a mid-extract crash leaves the marker absent so the
  // next install retries.
  await writeFile(`${finalPath}${EXTRACT_MARKER_SUFFIX}`, '');
}
