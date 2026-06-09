export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { q, limit = 12 } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    const payload = {
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20210721.00.00',
        },
      },
      query: q,
    };

    const response = await fetch('https://www.youtube.com/youtubei/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`YouTube API returned ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
    
    let items = [];
    if (contents.length > 0) {
      items = contents[0]?.itemSectionRenderer?.contents || [];
    }

    const results = [];
    for (const i of items) {
      if (results.length >= limit) break;
      
      const v = i.videoRenderer;
      if (!v || !v.lengthText) continue;

      const durationText = v.lengthText?.simpleText || v.lengthText?.runs?.[0]?.text;
      const artistText = v.ownerText?.simpleText || v.ownerText?.runs?.[0]?.text;
      const titleText = v.title?.simpleText || v.title?.runs?.[0]?.text;
      
      const thumbnails = v.thumbnail?.thumbnails || [];
      const thumbnailUrl = thumbnails.length > 0 ? thumbnails[thumbnails.length - 1].url : `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`;

      results.push({
        videoId: v.videoId,
        title: titleText || "Unknown",
        artist: artistText || "Unknown Artist",
        duration: durationText || "0:00",
        thumbnail: thumbnailUrl
      });
    }

    return res.status(200).json({ results, query: q, count: results.length });
  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({ error: error.message });
  }
}
