import { CrazyGamesPlatform, loadSdkScript } from './crazygames';
import { DevPlatform } from './dev';
import { StandalonePlatform } from './standalone';
import type { PlatformAdapter, ReleaseStage } from './types';

export function onCrazyGamesHost(): boolean {
  const hosts: string[] = [location.hostname];
  try {
    const ao = (location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
    if (ao) for (let i = 0; i < ao.length; i++) hosts.push(ao[i]);
  } catch {
    /* ignore */
  }
  if (document.referrer) hosts.push(document.referrer);
  return hosts.some((h) => /crazygames\./i.test(h));
}

/**
 * Chooses the platform adapter. Production: CrazyGames SDK when it initialises with a usable
 * environment; otherwise standalone (local save off-platform, memory-only on a CrazyGames host).
 * The dev adapter is reachable only in dev/test builds via ?platform=dev.
 */
export async function selectPlatform(stage: ReleaseStage, params: URLSearchParams): Promise<{ platform: PlatformAdapter; note: string }> {
  if (__DEV_TOOLS__ && params.get('platform') === 'dev') {
    const p = new DevPlatform(stage, params);
    await p.init();
    return { platform: p, note: 'dev platform (simulated)' };
  }
  // Test/self-hosting override. Ignored on CrazyGames so the Data module always stays the save there.
  if (params.get('platform') === 'standalone' && !onCrazyGamesHost()) {
    const p = new StandalonePlatform(stage, 'standalone', true);
    await p.init();
    return { platform: p, note: 'forced standalone' };
  }
  try {
    const sdk = await loadSdkScript();
    await sdk.init();
    if (sdk.environment === 'disabled') {
      const p = new StandalonePlatform(stage, 'disabled', true);
      await p.init();
      return { platform: p, note: 'SDK environment disabled (not on a CrazyGames domain)' };
    }
    const p = new CrazyGamesPlatform(sdk, stage);
    await p.init();
    return { platform: p, note: `SDK ${sdk.environment}` };
  } catch (e) {
    const onCg = onCrazyGamesHost();
    const p = new StandalonePlatform(stage, 'sdk-unavailable', !onCg);
    await p.init();
    return { platform: p, note: `SDK unavailable (${String(e)})${onCg ? '; memory-only progress' : ''}` };
  }
}
