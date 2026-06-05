// src/services/api.js
// Centralised API client for the Pinealon Flask backend.

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

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
// Streaming
// ---------------------------------------------------------------------------

/** Returns the URL the <audio> element should use for instant playback. */
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
