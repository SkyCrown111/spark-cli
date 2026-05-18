import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';

function isEnvVarName(name) {
  return /^[A-Z][A-Z0-9_]*$/.test(name);
}

const path = join(homedir(), '.spark-cli', 'config.yaml');
const doc = yaml.load(readFileSync(path, 'utf8'));
const mimo = doc.providers?.custom_providers?.find((p) => p.name === 'mimo');
if (mimo?.key_env && !isEnvVarName(mimo.key_env)) {
  mimo.api_key = mimo.key_env;
  delete mimo.key_env;
  console.log('Moved API key from key_env → api_key');
}
if (doc.model?.default) {
  doc.model.default = String(doc.model.default).toLowerCase();
  console.log('Model id:', doc.model.default);
}
writeFileSync(path, yaml.dump(doc, { lineWidth: 120 }), 'utf8');
console.log('Done:', path);
