/**
 * Audio / SFX generation providers (mock-first).
 */

import type { SparkCLIConfig } from '../../config/schema.js';
import { stageWriteBuffer } from '../staging/patch-manager.js';

export interface AudioGenRequest {
  prompt: string;
  durationSec?: number;
  outPath: string;
}

export interface AudioGenResult {
  path: string;
  staged: boolean;
  provider: string;
  source: 'generated' | 'mock';
}

export interface AudioGenProvider {
  id: string;
  generate(req: AudioGenRequest, projectRoot: string): Promise<AudioGenResult>;
}

/** Minimal valid WAV header + silence (mock). */
function mockWavBytes(durationSec = 0.25, sampleRate = 22050): Buffer {
  const samples = Math.floor(sampleRate * durationSec);
  const dataSize = samples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

export class MockAudioGenProvider implements AudioGenProvider {
  id = 'mock';

  async generate(req: AudioGenRequest, projectRoot: string): Promise<AudioGenResult> {
    const wav = mockWavBytes(req.durationSec ?? 0.3);
    const rel = req.outPath.endsWith('.wav') ? req.outPath : `${req.outPath}.wav`;
    stageWriteBuffer(projectRoot, rel, wav);
    return { path: rel, staged: true, provider: this.id, source: 'mock' };
  }
}

export function isAudioGenEnabled(config: SparkCLIConfig): boolean {
  return config.tools?.gen?.audio?.enabled === true;
}

export function resolveAudioGenProvider(_config: SparkCLIConfig): AudioGenProvider {
  return new MockAudioGenProvider();
}

export async function generateAudioAsset(
  projectRoot: string,
  config: SparkCLIConfig,
  req: AudioGenRequest,
): Promise<AudioGenResult> {
  if (!isAudioGenEnabled(config)) {
    throw new Error('Audio generation disabled — set tools.gen.audio.enabled: true');
  }
  return resolveAudioGenProvider(config).generate(req, projectRoot);
}
