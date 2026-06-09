export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { q, limit = 12 } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    // Strategy 1: YouTube InnerTube API (most reliable from server-side)
    const results = await searchViaInnerTube(q, parseInt(limit));
    if (results.length > 0) {
      return res.status(200).json({ results, query: q, count: results.length });
    }

    // Strategy 2: Scrape YouTube search HTML page
    const htmlResults = await searchViaHTML(q, parseInt(limit));
    if (htmlResults.length > 0) {
      return res.status(200).json({ results: htmlResults, query: q, count: htmlResults.length });
    }

    return res.status(200).json({ results: [], query: q, count: 0 });
  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function searchViaInnerTube(query, limit) {
  const payload = {
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: '2.20240530.02.00',
        hl: 'en',
        gl: 'US',
      },
    },
    query: query,
  };

  const response = await fetch(
    'https://www.youtube.com/youtubei/v1/search?prettyPrint=false',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    throw new Error(`InnerTube returned ${response.status}`);
  }

  const data = await response.json();

  // Navigate the nested response structure
  const contents =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
      ?.sectionListRenderer?.contents || [];

  const results = [];
  for (const section of contents) {
    const items = section?.itemSectionRenderer?.contents || [];
    for (const item of items) {
      if (results.length >= limit) break;

      const v = item.videoRenderer;
      if (!v || !v.videoId) continue;

      // Skip livestreams (no lengthText)
      const durationText =
        v.lengthText?.simpleText ||
        v.lengthText?.runs?.[0]?.text;

      const titleText =
        v.title?.runs?.map(r => r.text).join('') ||
        v.title?.simpleText ||
        'Unknown';

      const artistText =
        v.ownerText?.runs?.[0]?.text ||
        v.shortBylineText?.runs?.[0]?.text ||
        'Unknown Artist';

      const thumbnails = v.thumbnail?.thumbnails || [];
      const thumbnailUrl =
        thumbnails.length > 0
          ? thumbnails[thumbnails.length - 1].url
          : `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`;

      results.push({
        videoId: v.videoId,
        title: titleText,
        artist: artistText,
        duration: durationText || '0:00',
        thumbnail: thumbnailUrl,
      });
    }
  }

  return results;
}

async function searchViaHTML(query, limit) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!response.ok) {
    return [];
  }

  const html = await response.text();

  // Extract the ytInitialData JSON from the HTML
  const match = html.match(/var ytInitialData = ({.*?});<\/script>/s);
  if (!match) return [];

  try {
    const data = JSON.parse(match[1]);
    const contents =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents || [];

    const results = [];
    for (const section of contents) {
      const items = section?.itemSectionRenderer?.contents || [];
      for (const item of items) {
        if (results.length >= limit) break;

        const v = item.videoRenderer;
        if (!v || !v.videoId) continue;

        const durationText =
          v.lengthText?.simpleText ||
          v.lengthText?.runs?.[0]?.text;

        const titleText =
          v.title?.runs?.map(r => r.text).join('') ||
          v.title?.simpleText ||
          'Unknown';

        const artistText =
          v.ownerText?.runs?.[0]?.text ||
          v.shortBylineText?.runs?.[0]?.text ||
          'Unknown Artist';

        const thumbnails = v.thumbnail?.thumbnails || [];
        const thumbnailUrl =
          thumbnails.length > 0
            ? thumbnails[thumbnails.length - 1].url
            : `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`;

        results.push({
          videoId: v.videoId,
          title: titleText,
          artist: artistText,
          duration: durationText || '0:00',
          thumbnail: thumbnailUrl,
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}
