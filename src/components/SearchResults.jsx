// src/components/SearchResults.jsx
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, Plus, Download, CheckCircle, Zap, Loader2 } from "lucide-react";
import { usePlayer } from "../context/PlayerContext.jsx";

function formatDuration(secs) {
    if (!secs) return "";
    const m = Math.floor(secs / 60);
    const s = String(Math.floor(secs % 60)).padStart(2, "0");
    return `${m}:${s}`;
}

export default function SearchResults({ results, query, isSearching, error, onAddToPlaylist, onDownload, processingItems = [] }) {
    const { currentSong, isPlaying, playSong } = usePlayer();

    const getItemStatus = (videoId) => {
        const item = processingItems.find((i) => i.videoId === videoId);
        return item?.status ?? null;
    };

    if (!query) return null;

    return (
        <div className="w-full max-w-2xl mx-auto mt-4">
            {error && (
                <div className="text-center text-red-400 text-sm py-4">
                    ⚠️ {error} — make sure the Pinealon backend is running.
                </div>
            )}

            <AnimatePresence mode="wait">
                {isSearching && results.length === 0 ? (
                    <motion.div
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex flex-col items-center py-12 gap-3 text-gray-500"
                    >
                        <Loader2 size={28} className="animate-spin text-indigo-400" />
                        <span className="text-sm">Searching YouTube…</span>
                    </motion.div>
                ) : results.length === 0 && query ? (
                    <motion.div
                        key="empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-center text-gray-500 text-sm py-12"
                    >
                        No results for "<span className="text-gray-300">{query}</span>"
                    </motion.div>
                ) : (
                    <motion.div
                        key="results"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="space-y-1"
                    >
                        {results.map((song, i) => {
                            const isActive = currentSong?.videoId === song.videoId;
                            const status = getItemStatus(song.videoId);
                            const isConverting = status === "downloading" || status === "converting" || status === "queued";
                            const isDone = status === "completed" || status === "cached" || song.cached;

                            return (
                                <motion.div
                                    key={song.videoId}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.04 }}
                                    className={`group flex items-center gap-3 p-3 rounded-xl transition-all duration-200 cursor-pointer ${isActive
                                        ? "bg-indigo-500/15 border border-indigo-500/30"
                                        : "hover:bg-white/6 border border-transparent"
                                        }`}
                                    onClick={() => playSong(song)}
                                >
                                    {/* Thumbnail */}
                                    <div className="relative shrink-0 w-13 h-13">
                                        <img
                                            src={song.thumbnail}
                                            alt={song.title}
                                            className="w-13 h-13 rounded-lg object-cover w-[52px] h-[52px]"
                                        />
                                        {/* Play overlay */}
                                        <div className={`absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 transition-opacity ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                            }`}>
                                            {isActive && isPlaying ? (
                                                <Pause size={18} className="text-white" />
                                            ) : (
                                                <Play size={18} className="text-white ml-0.5" />
                                            )}
                                        </div>
                                        {/* Playing indicator dots */}
                                        {isActive && isPlaying && (
                                            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                                                {[0, 1, 2].map((k) => (
                                                    <div
                                                        key={k}
                                                        className="w-0.5 rounded-full bg-indigo-400"
                                                        style={{
                                                            animation: `soundbar 0.8s ease-in-out ${k * 0.15}s infinite alternate`,
                                                            height: "8px",
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-medium truncate ${isActive ? "text-indigo-300" : "text-white"}`}>
                                            {song.title}
                                        </p>
                                        <p className="text-xs text-gray-500 truncate">{song.artist}</p>
                                    </div>

                                    {/* Duration */}
                                    <span className="text-xs text-gray-600 shrink-0">
                                        {formatDuration(song.duration)}
                                    </span>

                                    {/* Status badge */}
                                    {isDone && (
                                        <span className="shrink-0 flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                            <Zap size={10} className="fill-current" />
                                            432Hz
                                        </span>
                                    )}
                                    {isConverting && (
                                        <Loader2 size={14} className="shrink-0 text-indigo-400 animate-spin" />
                                    )}

                                    {/* Action buttons */}
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onDownload?.(song); }}
                                            className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                            title="Download 432Hz Audio"
                                        >
                                            <Download size={15} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onAddToPlaylist?.(song); }}
                                            className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                            title="Add to playlist"
                                        >
                                            <Plus size={15} />
                                        </button>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
