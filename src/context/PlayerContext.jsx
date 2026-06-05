// src/context/PlayerContext.jsx
// Global player state — avoids prop-drilling through every component.

import { createContext, useContext, useReducer, useRef, useEffect, useCallback } from "react";
import * as api from "../services/api.js";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

const INITIAL_STATE = {
    currentSong: null,  // full song object
    queue: [],
    queueIndex: 0,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
    isRepeat: false,
    isShuffle: false,
    is432Hz: false,       // whether the currently playing song is pitch-shifted to 432Hz
    tuningDetails: null,  // the confidence and detection method reasoning
    isConverting: false,  // whether we are currently analyzing tuning
    conversionProgress: null, // text state e.g., "Analyzing tuning..."
    isBuffering: false,   // true when audio is stalled/buffering
};

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function reducer(state, action) {
    switch (action.type) {
        case "SET_SONG":
            return { ...state, currentSong: action.song, is432Hz: action.is432Hz ?? false };
        case "SET_QUEUE":
            return { ...state, queue: action.queue, queueIndex: action.index ?? 0 };
        case "SET_QUEUE_INDEX":
            return { ...state, queueIndex: action.index };
        case "SET_PLAYING":
            return { ...state, isPlaying: action.value };
        case "SET_TIME":
            return { ...state, currentTime: action.value };
        case "SET_DURATION":
            return { ...state, duration: action.value };
        case "SET_VOLUME":
            return { ...state, volume: action.value, isMuted: action.value === 0 };
        case "TOGGLE_MUTE":
            return { ...state, isMuted: !state.isMuted };
        case "TOGGLE_REPEAT":
            return { ...state, isRepeat: !state.isRepeat };
        case "TOGGLE_SHUFFLE":
            return { ...state, isShuffle: !state.isShuffle };
        case "SET_432HZ":
            return { ...state, is432Hz: action.value, tuningDetails: action.details ?? null };
        case "SET_CONVERTING":
            return { ...state, isConverting: action.value, conversionProgress: action.progress ?? null };
        case "SET_BUFFERING":
            return { ...state, isBuffering: action.value };
        default:
            return state;
    }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
    const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
    const audioRef = useRef(new Audio());
    const handleSongEndRef = useRef(null);

    // ── Audio element wiring ────────────────────────────────────────────────

    useEffect(() => {
        const audio = audioRef.current;

        const onTimeUpdate = () => dispatch({ type: "SET_TIME", value: audio.currentTime });
        const onDuration   = () => dispatch({ type: "SET_DURATION", value: audio.duration });
        const onPlay       = () => dispatch({ type: "SET_PLAYING", value: true });
        const onPause      = () => dispatch({ type: "SET_PLAYING", value: false });
        const onEnded      = () => handleSongEndRef.current?.();
        const onWaiting    = () => dispatch({ type: "SET_BUFFERING", value: true });
        const onCanPlay    = () => dispatch({ type: "SET_BUFFERING", value: false });

        const onError = () => {
            const mediaError = audio.error;
            console.error("🔴 Audio playback error:", {
                code: mediaError?.code,
                message: mediaError?.message,
                src: audio.src?.substring(0, 100),
            });
            dispatch({ type: "SET_PLAYING", value: false });
            dispatch({ type: "SET_BUFFERING", value: false });
        };

        audio.addEventListener("timeupdate", onTimeUpdate);
        audio.addEventListener("durationchange", onDuration);
        audio.addEventListener("play", onPlay);
        audio.addEventListener("pause", onPause);
        audio.addEventListener("ended", onEnded);
        audio.addEventListener("waiting", onWaiting);
        audio.addEventListener("canplay", onCanPlay);
        audio.addEventListener("error", onError);

        return () => {
            audio.removeEventListener("timeupdate", onTimeUpdate);
            audio.removeEventListener("durationchange", onDuration);
            audio.removeEventListener("play", onPlay);
            audio.removeEventListener("pause", onPause);
            audio.removeEventListener("ended", onEnded);
            audio.removeEventListener("waiting", onWaiting);
            audio.removeEventListener("canplay", onCanPlay);
            audio.removeEventListener("error", onError);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Apply volume/mute imperatively
    useEffect(() => {
        audioRef.current.volume = state.isMuted ? 0 : state.volume;
    }, [state.volume, state.isMuted]);

    // ── Core: Play a song ───────────────────────────────────────────────────

    const playSong = useCallback(
        async (song, playlistSongs = [], playlistId = null) => {
            if (!song) return;

            const newQueue = playlistSongs.length > 0 ? playlistSongs : [song];
            const idx = newQueue.findIndex((s) => s.id === song.id);
            dispatch({ type: "SET_QUEUE", queue: newQueue, index: idx >= 0 ? idx : 0 });

            const songObj = playlistId ? { ...song, playlistId } : song;
            const audio = audioRef.current;

            // Reset state immediately
            dispatch({ type: "SET_SONG", song: songObj, is432Hz: false });
            dispatch({ type: "SET_TIME", value: 0 });
            dispatch({ type: "SET_DURATION", value: 0 });
            dispatch({ type: "SET_BUFFERING", value: true });

            // ─── IMPORTANT: We ALWAYS route through our own Flask backend proxy.
            //
            // Why NOT use Piped direct URLs?
            // Piped returns raw YouTube CDN URLs (googlevideo.com). When the browser
            // tries to fetch these as audio.src, YouTube's CDN blocks cross-origin
            // requests (CORS) from a web page. The request gets rejected or redirected,
            // leaving the audio element with no data → stutter, silence, or "MEDIA_ERR_SRC_NOT_SUPPORTED".
            //
            // Our Flask /api/stream/<videoId> proxy:
            // 1. Runs on the same origin as the API (localhost:3001)
            // 2. Has CORS headers set to allow *
            // 3. Supports Range requests so the browser can seek
            // 4. Streams audio in chunks so playback starts fast
            //
            // Result: clean, uninterrupted audio with full seek support.
            const streamUrl = api.getStreamUrl(song.videoId);

            // Apply pitch shift to 432Hz BEFORE playing.
            // 432/440 = 0.98181... — slows playback by ~1.8%, dropping pitch by ~32 cents.
            // We do this immediately so there is no mid-stream stutter from a late rate change.
            // preservesPitch = false means the pitch actually drops with the rate (desired behavior).
            audio.preservesPitch = false;
            if (audio.mozPreservesPitch !== undefined) audio.mozPreservesPitch = false;
            if (audio.webkitPreservesPitch !== undefined) audio.webkitPreservesPitch = false;
            audio.playbackRate = 432 / 440; // 0.98181818...

            audio.src = streamUrl;
            audio.load();

            // Use "canplay" to trigger play so we know the browser has buffered enough
            const startPlayback = () => {
                audio.play().catch((err) => {
                    console.warn("Autoplay blocked or stream error:", err);
                    dispatch({ type: "SET_PLAYING", value: false });
                });
                audio.removeEventListener("canplay", startPlayback);
            };
            audio.addEventListener("canplay", startPlayback, { once: true });

            // Mark as 432Hz right away (we know we're always shifting)
            dispatch({ type: "SET_432HZ", value: true, details: { tuning: "440Hz→432Hz", reasoning: "Client-side pitch shift applied" } });

            // Now run tuning detection in the background (for display accuracy only —
            // it no longer changes playback, just updates the badge text)
            dispatch({ type: "SET_CONVERTING", value: true, progress: "Analyzing tuning..." });
            try {
                const res = await api.getTuning(song.videoId);
                dispatch({ type: "SET_CONVERTING", value: false });
                
                if (res.tuning === "432Hz") {
                    console.log("Song is natively 432Hz! Reverting pitch shift.");
                    audio.playbackRate = 1.0;
                    audio.preservesPitch = true;
                    if (audio.mozPreservesPitch !== undefined) audio.mozPreservesPitch = true;
                    if (audio.webkitPreservesPitch !== undefined) audio.webkitPreservesPitch = true;
                    dispatch({ type: "SET_432HZ", value: true, details: { ...res, reasoning: "Native 432Hz detected, no shift needed" } });
                } else {
                    dispatch({ type: "SET_432HZ", value: true, details: res });
                }
                
                console.log("Tuning detection result:", res);
            } catch (err) {
                console.warn("Tuning detection failed (non-critical):", err);
                dispatch({ type: "SET_CONVERTING", value: false });
                // Playback is unaffected — we already applied the shift.
            }
        },
        []
    );

    // ── Queue navigation ────────────────────────────────────────────────────

    const playByIndex = useCallback(
        (idx) => {
            const song = state.queue[idx];
            if (!song) return;
            dispatch({ type: "SET_QUEUE_INDEX", index: idx });
            playSong(song, state.queue, song.playlistId);
        },
        [state.queue, playSong]
    );

    const handleSongEnd = useCallback(() => {
        if (state.isRepeat) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => { });
            return;
        }
        const next = state.isShuffle
            ? Math.floor(Math.random() * state.queue.length)
            : (state.queueIndex + 1) % state.queue.length;
        playByIndex(next);
    }, [state.isRepeat, state.isShuffle, state.queue, state.queueIndex, playByIndex]);

    // Keep ref in sync so the event listener above doesn't go stale
    useEffect(() => { handleSongEndRef.current = handleSongEnd; }, [handleSongEnd]);

    const playNext = useCallback(() => {
        const next = state.isShuffle
            ? Math.floor(Math.random() * state.queue.length)
            : (state.queueIndex + 1) % state.queue.length;
        playByIndex(next);
    }, [state.isShuffle, state.queue, state.queueIndex, playByIndex]);

    const playPrevious = useCallback(() => {
        if (audioRef.current.currentTime > 3) {
            audioRef.current.currentTime = 0;
            return;
        }
        const prev = state.queueIndex === 0 ? state.queue.length - 1 : state.queueIndex - 1;
        playByIndex(prev);
    }, [state.queueIndex, state.queue, playByIndex]);

    // ── Playback controls ───────────────────────────────────────────────────

    const togglePlayPause = useCallback(() => {
        const a = audioRef.current;
        if (!a || !state.currentSong) return;
        a.paused ? a.play().catch(() => { }) : a.pause();
    }, [state.currentSong]);

    const seek = useCallback((pct) => {
        const a = audioRef.current;
        if (!a || !state.duration) return;
        a.currentTime = pct * state.duration;
    }, [state.duration]);

    const setVolume = useCallback((v) => {
        dispatch({ type: "SET_VOLUME", value: v });
    }, []);

    const addToQueue = useCallback((song) => {
        dispatch({ type: "SET_QUEUE", queue: [...state.queue, song], index: state.queueIndex });
    }, [state.queue, state.queueIndex]);

    // ── Helpers ─────────────────────────────────────────────────────────────

    // Duration shown to user is "real" track duration at 432Hz rate.
    // playbackRate = 432/440, so real elapsed time = currentTime / playbackRate
    // and total duration needs no correction since duration in the audio element
    // is unchanged (it's still the container length).
    const formatTime = (s) => {
        if (!s || isNaN(s)) return "0:00";
        return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    };

    const value = {
        ...state,
        audioRef,
        playSong,
        playNext,
        playPrevious,
        playByIndex,
        togglePlayPause,
        seek,
        setVolume,
        addToQueue,
        toggleRepeat: () => dispatch({ type: "TOGGLE_REPEAT" }),
        toggleShuffle: () => dispatch({ type: "TOGGLE_SHUFFLE" }),
        toggleMute: () => dispatch({ type: "TOGGLE_MUTE" }),
        formatTime,
    };

    return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
    const ctx = useContext(PlayerContext);
    if (!ctx) throw new Error("usePlayer must be inside <PlayerProvider>");
    return ctx;
}
