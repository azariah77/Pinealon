// src/services/api.js
// Centralised API client for the Pinealon Flask backend.
//
// In development: Vite proxies /api/* → http://localhost:3001/api/*
// In production:  VITE_API_URL should be set to the deployed backend URL.

const API_BASE = import.meta.env.VITE_API_URL || "https://pinealon-backend.onrender.com/api";

async function json(res) {
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `Request failed: ${res.status}`);
    }
    return res.json();
}

// ---------------------------------------------------------------------------
// Search — uses the Vercel serverless function at /api/search
// (InnerTube API from Vercel's clean IPs, no yt-dlp needed)
// ---------------------------------------------------------------------------

/** @returns {{ videoId, title, artist, duration, thumbnail, cached }[] } */
export async function searchYouTube(query, limit = 12) {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}`);
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

/**
 * Returns the URL to stream a video's audio through our own Flask proxy.
 *
 * ⚠️  We do NOT use Piped direct URLs for streaming.
 * Piped returns raw googlevideo.com CDN URLs which the browser CANNOT fetch
 * cross-origin (YouTube sets strict CORS headers). Our Flask proxy at
 * /api/stream/<videoId> handles the yt-dlp extraction and streams the audio
 * with proper CORS + Range support.
 */
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
