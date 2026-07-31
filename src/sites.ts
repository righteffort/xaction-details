export interface SiteDef {
  origin: string;
  scriptFile: string;
}

export const SITES: SiteDef[] = [
  { origin: 'https://www.amazon.com', scriptFile: 'src/amazonContent.js' },
  { origin: 'https://secure.chase.com', scriptFile: 'src/chaseContent.js' },
];

export function patternFor(origin: string): string {
  return `${origin}/*`;
}

export function hostnameFor(origin: string): string {
  return new URL(origin).hostname;
}

export function registrationIdFor(site: SiteDef): string {
  return `content-script-${hostnameFor(site.origin)}`;
}
