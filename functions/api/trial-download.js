// Direct redirect to verified sample release asset
const DEFAULT_SAMPLE_DOWNLOAD_URL = 'https://github.com/davidpovarsky/parsha-pics-site/releases/download/v1.0.0/Lech-Lecha-Parsha-Pics-Sample.zip';

export function onRequestGet({ env }) {
  const url = env?.SAMPLE_DOWNLOAD_URL || DEFAULT_SAMPLE_DOWNLOAD_URL;
  return Response.redirect(url, 302);
}

export function onRequestPost({ env }) {
  const url = env?.SAMPLE_DOWNLOAD_URL || DEFAULT_SAMPLE_DOWNLOAD_URL;
  return Response.redirect(url, 302);
}
