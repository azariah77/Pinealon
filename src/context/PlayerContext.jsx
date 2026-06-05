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
    is432Hz: false,       // whether the currently playing song is perfectly tuned to 432Hz
    tuningDetails: null,  // the confidence and detection method reasoning
    isConverting: false,  // whether we are currently analyzing tuning
    conversionProgress: null, // text state e.g., "Analyzing tuning..."
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

    // ── Core: Play a song ───────────────────────────────────────────────────

    const playSong = useCallback(
        async (song, playlistSongs = [], playlistId = null) => {
            if (!song) return;

            const newQueue = playlistSongs.length > 0 ? playlistSongs : [song];
            const idx = newQueue.findIndex((s) => s.id === song.id);
            dispatch({ type: "SET_QUEUE", queue: newQueue, index: idx >= 0 ? idx : 0 });

            const songObj = playlistId ? { ...song, playlistId } : song;
            const audio = audioRef.current;

            // Reset state
            dispatch({ type: "SET_SONG", song: songObj, is432Hz: false, details: null });
            dispatch({ type: "SET_CONVERTING", value: true, progress: "Analyzing tuning..." });
            
            // Get the raw audio URL instantly from Piped APIs
            const directUrl = await api.getDirectAudioUrl(song.videoId);
            audio.src = directUrl;
            audio.playbackRate = 1.0;
            audio.preservesPitch = true;
            if (audio.mozPreservesPitch !== undefined) audio.mozPreservesPitch = true;
            if (audio.webkitPreservesPitch !== undefined) audio.webkitPreservesPitch = true;
            
            audio.load();
            audio.play().catch(() => { });

            // Fetch tuning detection in the background
            try {
                const res = await api.getTuning(song.videoId);
                dispatch({ type: "SET_CONVERTING", value: false });
                
                // If the song is already 432Hz natively, we do nothing.
                if (res.tuning === "432Hz") {
                    console.log("Song is natively 432Hz!", res);
                    dispatch({ type: "SET_432HZ", value: true, details: res });
                } else {
                    // It's 440Hz or unknown: Drop frequency via playbackRate to instantly hit 432Hz
                    console.log("Song is 440Hz. Pitch shifting to 432Hz via playbackRate...", res);
                    audio.playbackRate = 432 / 440; // 0.981818
                    audio.preservesPitch = false;
                    if (audio.mozPreservesPitch !== undefined) audio.mozPreservesPitch = false;
                    if (audio.webkitPreservesPitch !== undefined) audio.webkitPreservesPitch = false;
                    
                    dispatch({ type: "SET_432HZ", value: true, details: res });
                }
            } catch (err) {
                console.error("Tuning detection failed, defaulting to pitch shift:", err);
                dispatch({ type: "SET_CONVERTING", value: false });
                
                // Fallback to applying pitch shift just in case
                audio.playbackRate = 432 / 440;
                audio.preservesPitch = false;
                if (audio.mozPreservesPitch !== undefined) audio.mozPreservesPitch = false;
                if (audio.webkitPreservesPitch !== undefined) audio.webkitPreservesPitch = false;
                
                dispatch({ type: "SET_432HZ", value: true, details: { reasoning: "Detection failed, forced 432Hz" } });
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
