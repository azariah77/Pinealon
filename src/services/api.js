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
// Cache
// ---------------------------------------------------------------------------

export async function checkCache(videoId) {
    const res = await fetch(`${API_BASE}/cache/${videoId}`);
    return json(res);
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function getMetadata(videoId) {
    const res = await fetch(`${API_BASE}/metadata`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
    });
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
// Conversion (async — returns immediately)
// ---------------------------------------------------------------------------

/**
 * Start a background 432Hz conversion job.
 * If the file is already cached, returns { status: "completed", fileUrl, fromCache: true }
 * Otherwise returns { status: "processing", jobId }
 */
export async function startConversion(videoId, options = {}) {
    const { convertTo432Hz = true, format = "mp3", quality = "192k", method = "auto" } = options;
    const res = await fetch(`${API_BASE}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, convertTo432Hz, format, quality, method }),
    });
    return json(res);
}

export async function getJobStatus(jobId) {
    const res = await fetch(`${API_BASE}/status/${jobId}`);
    return json(res);
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export async function healthCheck() {
    const res = await fetch(`${API_BASE}/health`);
    return json(res);
}

export { API_BASE };
