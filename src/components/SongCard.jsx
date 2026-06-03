// src/components/SongCard.jsx
// Reusable song row for playlist detail + favorites views.

import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, Heart, MoreVertical, List, Trash2, Zap, Loader2, Music, Download } from "lucide-react";
import { useState } from "react";
import { usePlayer } from "../context/PlayerContext.jsx";

export default function SongCard({ song, index, playlist, favoriteSongs, onToggleFavorite, onRemove, onAddToQueue, onDownload }) {
    const { currentSong, isPlaying, playSong, togglePlayPause } = usePlayer();
    const [menuOpen, setMenuOpen] = useState(false);

    const isActive = currentSong?.id === song.id;
    const isFav = favoriteSongs?.some((s) => s.id === song.id);

    const handlePlay = () => {
        if (isActive) {
            togglePlayPause();
        } else {
            playSong(song, playlist?.songs || [], playlist?.id || null);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.04 }}
            className={`group relative flex items-center gap-3 p-3 rounded-xl transition-all border border-transparent hover:bg-white/5 ${isActive ? "!bg-indigo-500/12 !border-indigo-500/25" : ""
                }`}
        >
            {/* Thumbnail / index */}
            <div className="relative w-12 h-12 shrink-0">
                {song.thumbnail ? (
                    <img src={song.thumbnail} alt={song.title} className="w-12 h-12 rounded-lg object-cover" />
                ) : (
                    <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center">
                        <Music size={18} className="text-white" />
                    </div>
                )}
                {/* Hover play overlay */}
                <div
                    onClick={handlePlay}
                    className={`absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 cursor-pointer transition-opacity ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        }`}
                >
                    {isActive && isPlaying ? (
                        <Pause size={16} className="text-white" />
                    ) : (
                        <Play size={16} className="text-white ml-0.5" />
                    )}
                </div>
                {/* Playing indicator */}
                {isActive && isPlaying && (
                    <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
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
                <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-xs text-gray-500 truncate">{song.artist}</p>
                    {song.isConverted && (
                        <span className="flex items-center gap-0.5 text-[10px] text-emerald-400 shrink-0">
                            <Zap size={8} className="fill-current" />432Hz
                        </span>
                    )}
                </div>
            </div>

            <span className="text-xs text-gray-600 shrink-0">{song.duration}</span>

            {/* More menu */}
            <div className="relative">
                <button
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
                    className="p-2 rounded-full text-gray-600 hover:text-white hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
                >
                    <MoreVertical size={15} />
                </button>

                <AnimatePresence>
                    {menuOpen && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -6 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -6 }}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 top-9 w-48 bg-[#1f1f2a] border border-white/10 rounded-xl shadow-2xl z-40 overflow-hidden"
                        >
                            <button
                                onClick={() => { onToggleFavorite?.(song); setMenuOpen(false); }}
                                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-white hover:bg-white/8 transition-colors"
                            >
                                <Heart size={14} className={isFav ? "fill-current text-rose-500" : ""} />
                                {isFav ? "Remove from Favorites" : "Add to Favorites"}
                            </button>
                            <button
                                onClick={() => { onAddToQueue?.(song); setMenuOpen(false); }}
                                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-white hover:bg-white/8 transition-colors"
                            >
                                <List size={14} />
                                Add to Queue
                            </button>
                            <button
                                onClick={() => { onDownload?.(song); setMenuOpen(false); }}
                                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-white hover:bg-white/8 transition-colors"
                            >
                                <Download size={14} />
                                Download 432Hz
                            </button>
                            <div className="border-t border-white/8" />
                            <button
                                onClick={() => { onRemove?.(song.id); setMenuOpen(false); }}
                                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                                <Trash2 size={14} />
                                Remove from Playlist
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}
