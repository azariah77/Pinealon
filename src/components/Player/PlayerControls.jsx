// src/components/Player/PlayerControls.jsx
// Shared play/skip/seek/volume — used by both MiniPlayer and FullPlayer.

import { Shuffle, SkipBack, Play, Pause, SkipForward, Repeat, Volume2, VolumeX } from "lucide-react";
import { usePlayer } from "../../context/PlayerContext.jsx";

export function ProgressBar({ compact = false }) {
    const { currentTime, duration, seek, formatTime } = usePlayer();
    const pct = duration ? currentTime / duration : 0;

    const handleClick = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        seek((e.clientX - rect.left) / rect.width);
    };

    return (
        <div className={compact ? "" : "w-full max-w-2xl"}>
            <div
                onClick={handleClick}
                className={`relative ${compact ? "h-1" : "h-1.5"} bg-white/10 rounded-full cursor-pointer group`}
            >
                <div
                    className="absolute h-full bg-gradient-to-r from-indigo-400 to-violet-500 rounded-full transition-none"
                    style={{ width: `${pct * 100}%` }}
                />
                <div
                    className="absolute w-3 h-3 bg-white rounded-full top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 shadow-lg transition-opacity"
                    style={{ left: `${pct * 100}%`, marginLeft: "-6px" }}
                />
            </div>
            {!compact && (
                <div className="flex justify-between mt-1.5 text-[11px] text-gray-500">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                </div>
            )}
        </div>
    );
}

export function PlaybackButtons({ size = "normal" }) {
    const { isPlaying, isRepeat, isShuffle, togglePlayPause, playNext, playPrevious, toggleRepeat, toggleShuffle } = usePlayer();

    const BIG = size === "large";
    const btnCls = "p-2 rounded-full transition-all";
    const activeCls = "text-indigo-400 bg-indigo-500/20";
    const inactiveCls = "text-gray-400 hover:text-white hover:bg-white/10";

    return (
        <div className="flex items-center gap-3">
            <button onClick={toggleShuffle} className={`${btnCls} ${isShuffle ? activeCls : inactiveCls}`}>
                <Shuffle size={BIG ? 22 : 17} />
            </button>
            <button onClick={playPrevious} className={`${btnCls} ${inactiveCls}`}>
                <SkipBack size={BIG ? 28 : 20} />
            </button>
            <button
                onClick={togglePlayPause}
                className={`${BIG ? "p-5" : "p-3"} bg-white hover:bg-gray-100 rounded-full transition-all hover:scale-105 shadow-lg`}
            >
                {isPlaying ? (
                    <Pause size={BIG ? 28 : 18} className="text-black" />
                ) : (
                    <Play size={BIG ? 28 : 18} className="text-black ml-0.5" />
                )}
            </button>
            <button onClick={playNext} className={`${btnCls} ${inactiveCls}`}>
                <SkipForward size={BIG ? 28 : 20} />
            </button>
            <button onClick={toggleRepeat} className={`${btnCls} ${isRepeat ? activeCls : inactiveCls}`}>
                <Repeat size={BIG ? 22 : 17} />
            </button>
        </div>
    );
}

export function VolumeControl({ compact = false }) {
    const { volume, isMuted, setVolume, toggleMute } = usePlayer();

    return (
        <div className="flex items-center gap-2">
            <button onClick={toggleMute} className="p-2 text-gray-400 hover:text-white transition-colors">
                {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            {!compact && (
                <input
                    type="range"
                    min="0" max="1" step="0.01"
                    value={isMuted ? 0 : volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    className="w-20 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                />
            )}
        </div>
    );
}
