import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const URI_RE = /(ws:\/\/127\.0\.0\.1:\d+\/[A-Za-z0-9_\-+=]+\/ws)/;

export function sniffVmServiceUri(projectRoot?: string): string | null {
  const fromClipboard = sniffFromClipboard();
  if (fromClipboard) return fromClipboard;

  const roots = [process.cwd()];
  if (projectRoot) roots.unshift(projectRoot);
  for (const root of roots) {
    const f = join(root, '.dart_tool', 'netscope_vm_service_uri');
    if (existsSync(f)) {
      const raw = readFileSync(f, 'utf-8').trim();
      const m = raw.match(URI_RE);
      if (m) return m[1];
    }
  }
  return null;
}

function sniffFromClipboard(): string | null {
  try {
    const text = execSync('pbpaste', { encoding: 'utf-8' });
    const m = text.match(URI_RE);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

