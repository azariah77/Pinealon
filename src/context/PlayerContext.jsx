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
    is432Hz: false,       // whether the playing source is the 432Hz version
    isConverting: false,  // background conversion in progress
    conversionProgress: null, // null | "downloading" | "converting" | number%
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
            return { ...state, is432Hz: action.value };
        case "SET_CONVERTING":
            return { ...state, isConverting: action.value, conversionProgress: action.progress ?? null };
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
    const conversionPollRef = useRef(null);

    // ── Audio element wiring ────────────────────────────────────────────────

    useEffect(() => {
        const audio = audioRef.current;

        const onTimeUpdate = () => dispatch({ type: "SET_TIME", value: audio.currentTime });
        const onDuration = () => dispatch({ type: "SET_DURATION", value: audio.duration });
        const onPlay = () => dispatch({ type: "SET_PLAYING", value: true });
        const onPause = () => dispatch({ type: "SET_PLAYING", value: false });
        const onEnded = () => handleSongEndRef.current?.();

        audio.addEventListener("timeupdate", onTimeUpdate);
        audio.addEventListener("durationchange", onDuration);
        audio.addEventListener("play", onPlay);
        audio.addEventListener("pause", onPause);
        audio.addEventListener("ended", onEnded);
        
        const onError = (e) => {
            const mediaError = audio.error;
            console.error("🔴 Audio playback error:", {
                code: mediaError?.code,
                message: mediaError?.message,
                src: audio.src?.substring(0, 100),
            });
        };
        audio.addEventListener("error", onError);

        return () => {
            audio.removeEventListener("timeupdate", onTimeUpdate);
            audio.removeEventListener("durationchange", onDuration);
            audio.removeEventListener("play", onPlay);
            audio.removeEventListener("pause", onPause);
            audio.removeEventListener("ended", onEnded);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Apply volume/mute imperatively
    useEffect(() => {
        audioRef.current.volume = state.isMuted ? 0 : state.volume;
    }, [state.volume, state.isMuted]);

    // ── Stable ref for handleSongEnd (avoids stale closure in event listener)
    const handleSongEndRef = useRef(null);

    // ── Background-conversion polling ───────────────────────────────────────

    const stopPolling = useCallback(() => {
        if (conversionPollRef.current) {
            clearInterval(conversionPollRef.current);
            conversionPollRef.current = null;
        }
    }, []);

    const startPolling = useCallback((jobId) => {
        stopPolling();
        conversionPollRef.current = setInterval(async () => {
            try {
                const status = await api.getJobStatus(jobId);
                if (status.status === "completed") {
                    stopPolling();
                    dispatch({ type: "SET_CONVERTING", value: false });
                    dispatch({ type: "SET_432HZ", value: true });

                    // Seamless swap: save position → change src → restore position
                    const audio = audioRef.current;
                    const savedTime = audio.currentTime;
                    const wasPlaying = !audio.paused;
                    audio.src = api.getFileUrl(status.fileName);
                    audio.load();
                    audio.currentTime = savedTime;
                    if (wasPlaying) audio.play().catch(() => { });
                } else if (status.status === "error") {
                    stopPolling();
                    dispatch({ type: "SET_CONVERTING", value: false });
                } else {
                    dispatch({ type: "SET_CONVERTING", value: true, progress: status.status });
                }
            } catch {
                // network hiccup — keep polling
            }
        }, 2500);
    }, [stopPolling]);

    // ── Core: Play a song ───────────────────────────────────────────────────

    const playSong = useCallback(
        async (song, playlistSongs = [], playlistId = null) => {
            if (!song) return;
            stopPolling();

            const newQueue = playlistSongs.length > 0 ? playlistSongs : [song];
            const idx = newQueue.findIndex((s) => s.id === song.id);
            dispatch({ type: "SET_QUEUE", queue: newQueue, index: idx >= 0 ? idx : 0 });

            const songObj = playlistId ? { ...song, playlistId } : song;
            const audio = audioRef.current;

            // Case 1: already have a converted 432Hz URL stored on the song
            if (song.convertedAudioUrl) {
                dispatch({ type: "SET_SONG", song: songObj, is432Hz: true });
                dispatch({ type: "SET_CONVERTING", value: false });
                audio.src = song.convertedAudioUrl;
                audio.load();
                audio.play().catch(() => { });
                return;
            }

            // Case 2: check backend cache first
            try {
                const cache = await api.checkCache(song.videoId);
                if (cache.cached) {
                    dispatch({ type: "SET_SONG", song: songObj, is432Hz: true });
                    dispatch({ type: "SET_CONVERTING", value: false });
                    audio.src = api.getFileUrl(cache.filename);
                    audio.load();
                    audio.play().catch(() => { });
                    return;
                }
            } catch { /* ignore */ }

            // Case 3: play stream immediately, start background conversion
            dispatch({ type: "SET_SONG", song: songObj, is432Hz: false });
            dispatch({ type: "SET_CONVERTING", value: true, progress: "downloading" });
            audio.src = api.getStreamUrl(song.videoId);
            audio.load();
            audio.play().catch(() => { });

            // Fire off conversion in background
            try {
                const result = await api.startConversion(song.videoId);
                if (result.status === "completed") {
                    // Already cached (race won) — swap now
                    const savedTime = audio.currentTime;
                    const wasPlaying = !audio.paused;
                    audio.src = api.getFileUrl(result.fileName || result.fileUrl?.split("/api/files/")[1]);
                    audio.load();
                    audio.currentTime = savedTime;
                    if (wasPlaying) audio.play().catch(() => { });
                    dispatch({ type: "SET_CONVERTING", value: false });
                    dispatch({ type: "SET_432HZ", value: true });
                } else if (result.jobId) {
                    startPolling(result.jobId);
                }
            } catch {
                dispatch({ type: "SET_CONVERTING", value: false });
            }
        },
        [startPolling, stopPolling]
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
