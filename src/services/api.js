// src/services/api.js
// Centralised API client for the Pinealon Flask backend.

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

const PIPED_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.smnz.de",
    "https://api.piped.projectsegfau.lt",
    "https://pipedapi.lunar.icu",
    "https://piped-api.garudalinux.org"
];

async function json(res) {
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `Request failed: ${res.status}`);
    }
    return res.json();
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** @returns {{ videoId, title, artist, duration, thumbnail, cached }[] } */
export async function searchYouTube(query, limit = 12) {
    // Try Piped APIs first for 0-latency search that bypasses Hugging Face
    for (const instance of PIPED_INSTANCES) {
        try {
            const res = await fetch(`${instance}/search?q=${encodeURIComponent(query)}&filter=music_songs`);
            if (!res.ok) continue;
            const data = await res.json();
            
            if (data && data.items) {
                const results = data.items.slice(0, limit).map(item => {
                    const videoId = item.url.split('v=')[1] || item.url.split('/').pop();
                    return {
                        videoId,
                        title: item.title,
                        artist: item.uploaderName || item.uploader || "Unknown Artist",
                        duration: item.duration,
                        thumbnail: item.thumbnail
                    };
                });
                return { results, query, count: results.length };
            }
        } catch (e) {
            console.warn(`Piped search failed for ${instance}, trying next...`);
        }
    }

    // Fallback to Hugging Face backend
    const res = await fetch(
        `${API_BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}`
    );
    return json(res);
}

// ---------------------------------------------------------------------------
// Tuning Detection
// ---------------------------------------------------------------------------

export async function getTuning(videoId) {
    const res = await fetch(`${API_BASE}/tuning/${videoId}`);
    return json(res);
}

// ---------------------------------------------------------------------------
// Streaming (Direct Piped API for 0-Latency)
// ---------------------------------------------------------------------------

/** 
 * Gets the raw audio URL directly from a public Piped instance, bypassing our backend.
 * This ensures 0-latency and no Hugging Face IP bans.
 */
export async function getDirectAudioUrl(videoId) {
    for (const instance of PIPED_INSTANCES) {
        try {
            const res = await fetch(`${instance}/streams/${videoId}`);
            if (!res.ok) continue;
            const data = await res.json();
            
            // Find the best audio stream (preferably webm or m4a)
            if (data && data.audioStreams && data.audioStreams.length > 0) {
                // Sort by bitrate descending
                const streams = data.audioStreams.sort((a, b) => b.bitrate - a.bitrate);
                return streams[0].url;
            }
        } catch (e) {
            console.warn(`Piped instance ${instance} failed, trying next...`);
        }
    }
    
    // Fallback to our backend if all Piped APIs fail
    return `${API_BASE}/stream/${videoId}`;
}

export function getStreamUrl(videoId) {
    return `${API_BASE}/stream/${videoId}`;
}

/** Returns the URL for a previously converted file. */
export function getFileUrl(filename) {
    return `${API_BASE}/files/${filename}`;
}

export function getDownloadUrl(filename) {
    return `${API_BASE}/download/${filename}`;
}



// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export async function healthCheck() {
    const res = await fetch(`${API_BASE}/health`);
    return json(res);
}

export { API_BASE };
