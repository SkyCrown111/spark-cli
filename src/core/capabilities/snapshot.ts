/**
 * Runtime capability snapshot for doctor / diagnostics.
 * Surfaces degradation modes (mock providers, regex C++ index, optional deps).
 */

import type { SparkCLIConfig } from '../../config/schema.js';
import { probeOptionalRequire } from '../../utils/optional-module.js';
import { getCppIndexBackend } from '../../engines/unreal/cpp-index.js';
import { getImageDimBackend } from '../assets/image-dims.js';
import { isTreeSitterCppAvailable } from '../../engines/unreal/cpp-index-ast.js';
import { isImageGenEnabled, resolveImageGenProviderId } from '../providers/image-gen.js';
import { isAudioGenEnabled, resolveAudioGenProviderId } from '../providers/audio-gen.js';
import { resolveModelForTask } from '../providers/router.js';

export interface CapabilitySnapshot {
  imageGen: {
    enabled: boolean;
    configuredProvider: string;
    effectiveProvider: string;
  };
  audioGen: {
    enabled: boolean;
    configuredProvider: string;
    effectiveProvider: string;
  };
  subagent: {
    model?: string;
    modelResolveOk: boolean;
    modelResolveMessage?: string;
  };
  unrealCppIndex: {
    backend: 'regex' | 'tree-sitter';
    treeSitterInstalled: boolean;
  };
  assetsAudit: {
    imageDimBackend: 'sharp' | 'header';
  };
  optionalPackages: Record<string, { installed: boolean; reason?: string }>;
}

const OPTIONAL_PACKAGE_IDS = ['sharp', 'tree-sitter', 'tree-sitter-cpp', 'music-metadata'] as const;

export function buildCapabilitySnapshot(
  config: SparkCLIConfig,
): CapabilitySnapshot {
  const imageConfigured = config.tools?.gen?.image?.provider ?? 'mock';
  const audioConfigured = config.tools?.gen?.audio?.provider ?? 'mock';

  let subModelResolveOk = true;
  let subModelResolveMessage: string | undefined;
  const subModel = config.subagent?.model?.trim();
  if (subModel) {
    try {
      const slash = subModel.indexOf('/');
      if (slash >= 0) {
        resolveModelForTask(config, 'chat', {
          provider: subModel.slice(0, slash).trim(),
          model: subModel.slice(slash + 1).trim(),
        });
      } else {
        resolveModelForTask(config, 'chat', { model: subModel });
      }
    } catch (e) {
      subModelResolveOk = false;
      subModelResolveMessage = e instanceof Error ? e.message : String(e);
    }
  }

  const optionalPackages: CapabilitySnapshot['optionalPackages'] = {};
  for (const id of OPTIONAL_PACKAGE_IDS) {
    const hit = probeOptionalRequire(id);
    optionalPackages[id] = hit.ok
      ? { installed: true }
      : { installed: false, reason: hit.reason };
  }

  return {
    imageGen: {
      enabled: isImageGenEnabled(config),
      configuredProvider: imageConfigured,
      effectiveProvider: resolveImageGenProviderId(config),
    },
    audioGen: {
      enabled: isAudioGenEnabled(config),
      configuredProvider: audioConfigured,
      effectiveProvider: resolveAudioGenProviderId(config),
    },
    subagent: {
      model: subModel || undefined,
      modelResolveOk: subModelResolveOk,
      modelResolveMessage: subModelResolveMessage,
    },
    unrealCppIndex: {
      backend: getCppIndexBackend(),
      treeSitterInstalled: isTreeSitterCppAvailable(),
    },
    assetsAudit: {
      imageDimBackend: getImageDimBackend(),
    },
    optionalPackages,
  };
}
