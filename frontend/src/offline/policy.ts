export function offlineWriteSupported(method: string, url: string) {
  return (method === 'post' && url === '/attendance/take')
    || (method === 'put' && /^\/attendance\/sessions\/[^/]+$/.test(url))
    || (method === 'put' && /^\/gradebook\/[^/]+\/entries$/.test(url))
    || (method === 'post' && /^\/teachers\/[^/]+\/assignments$/.test(url));
}

export function nextOfflineVersion(baseline: number, pendingVersions: number[]): number {
  return Math.max(baseline, ...pendingVersions.map(version => version + 1));
}
