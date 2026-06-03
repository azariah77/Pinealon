// src/components/Player/MiniPlayer.jsx
import { motion, AnimatePresence } from "framer-motion";
import { Music, Heart, Maximize2, List, Zap, Loader2 } from "lucide-react";
import { usePlayer } from "../../context/PlayerContext.jsx";
import { ProgressBar, PlaybackButtons, VolumeControl } from "./PlayerControls.jsx";

export default function MiniPlayer({ favoriteSongs, onToggleFavorite, onExpand, onShowQueue }) {
    const { currentSong, isPlaying, is432Hz, isConverting } = usePlayer();

    const isFav = favoriteSongs?.some((s) => s.id === currentSong?.id);

    return (
        <AnimatePresence>
            {currentSong && (
                <motion.div
                    initial={{ y: 80, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 80, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 28 }}
                    className="fixed bottom-0 left-0 right-0 z-50"
                >
                    {/* Progress bar sits flush on top */}
                    <div className="px-0">
                        <ProgressBar compact />
                    </div>

                    <div className="bg-[#111]/90 border-t border-white/8 backdrop-blur-2xl px-4 py-3">
                        <div className="flex items-center justify-between max-w-screen-xl mx-auto gap-4">

                            {/* Song info — left */}
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div
                                    className="relative cursor-pointer shrink-0"
                                    onClick={onExpand}
                                >
                                    {currentSong.thumbnail ? (
                                        <img
                                            src={currentSong.thumbnail}
                                            alt={currentSong.title}
                                            className="w-12 h-12 rounded-lg object-cover"
                                        />
                                    ) : (
                                        <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center">
                                            <Music size={20} className="text-white" />
                                        </div>
                                    )}
                                    {/* 432Hz badge */}
                                    <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center transition-all ${is432Hz ? "bg-emerald-500 opacity-100" : isConverting ? "bg-indigo-500 opacity-100" : "opacity-0"
                                        }`}>
                                        {isConverting ? (
                                            <Loader2 size={9} className="text-white animate-spin" />
                                        ) : (
                                            <Zap size={9} className="text-white fill-current" />
                                        )}
                                    </div>
                                </div>

                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-white truncate">{currentSong.title}</p>
                                    <div className="flex items-center gap-1.5">
                                        <p className="text-xs text-gray-500 truncate">{currentSong.artist}</p>
                                        {is432Hz && (
                                            <span className="text-[10px] text-emerald-400 font-medium shrink-0">432Hz</span>
                                        )}
                                        {isConverting && !is432Hz && (
                                            <span className="text-[10px] text-indigo-400 font-medium shrink-0">converting…</span>
                                        )}
                                    </div>
                                </div>

                                <button
                                    onClick={() => onToggleFavorite?.(currentSong)}
                                    className="p-2 rounded-full hover:bg-white/10 transition-colors"
                                >
                                    <Heart size={16} className={isFav ? "fill-current text-rose-500" : "text-gray-500"} />
                                </button>
                            </div>

                            {/* Controls — center */}
                            <div className="flex items-center">
                                <PlaybackButtons size="normal" />
                            </div>

                            {/* Right actions */}
                            <div className="flex-1 flex items-center justify-end gap-1">
                                <button onClick={onShowQueue} className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-colors">
                                    <List size={17} />
                                </button>
                                <button onClick={onExpand} className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-colors">
                                    <Maximize2 size={17} />
                                </button>
                                <VolumeControl />
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
