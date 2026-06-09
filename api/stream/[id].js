// api/stream/[id].js
// Vercel serverless function to resolve audio stream URLs.
// Priority: Piped proxy instances → HF backend fallback.
// This takes priority over the vercel.json rewrite for /api/stream/*.

const HF_BACKEND = 'https://joshuaazz-pinealon-backend.hf.space';

// Piped instances that proxy YouTube audio (so browser can play without CORS issues)
const PIPED_INSTANCES = [
  'https://api.piped.private.coffee',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.lunar.icu',
  'https://pipedapi.smnz.de',
  'https://api.piped.projectsegfau.lt',
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Video ID is required' });
  }

  // Strategy 1: Try Piped instances in parallel for speed
  try {
    const pipedUrl = await tryPipedInstances(id);
    if (pipedUrl) {
      // Redirect browser to Piped's proxied audio URL
      // The <audio> element follows redirects transparently
      return res.redirect(302, pipedUrl);
    }
  } catch (e) {
    console.warn('All Piped instances failed:', e.message);
  }

  // Strategy 2: Proxy through HF backend (yt-dlp based)
  // Pass through as a redirect so we don't eat the 10s timeout
  const hfStreamUrl = `${HF_BACKEND}/api/stream/${id}`;
  return res.redirect(302, hfStreamUrl);
}

async function tryPipedInstances(videoId) {
  // Race all instances in parallel, return first successful audio URL
  const results = await Promise.allSettled(
    PIPED_INSTANCES.map(instance => fetchPipedAudio(instance, videoId))
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      return result.value;
    }
  }
  return null;
}

async function fetchPipedAudio(instance, videoId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const r = await fetch(`${instance}/streams/${videoId}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    clearTimeout(timeout);

    if (!r.ok) return null;
    const data = await r.json();

    // Get audio streams, prefer highest bitrate
    const audioStreams = (data.audioStreams || [])
      .filter(s => s.url && s.mimeType?.includes('audio'))
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

    if (audioStreams.length > 0) {
      return audioStreams[0].url;
    }

    // Some Piped instances return video streams with audio
    // Check for those as fallback
    const videoWithAudio = (data.videoStreams || [])
      .filter(s => s.url && s.videoOnly === false)
      .sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0)); // lowest quality video

    if (videoWithAudio.length > 0) {
      return videoWithAudio[0].url;
    }

    return null;
  } catch (e) {
    clearTimeout(timeout);
    return null;
  }
}
