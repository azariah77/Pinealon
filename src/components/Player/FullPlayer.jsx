// src/components/Player/FullPlayer.jsx
import { motion, AnimatePresence } from "framer-motion";
import { Minimize2, Music, Heart, Zap, Loader2 } from "lucide-react";
import { usePlayer } from "../../context/PlayerContext.jsx";
import { ProgressBar, PlaybackButtons, VolumeControl } from "./PlayerControls.jsx";

export default function FullPlayer({ isOpen, onClose, favoriteSongs, onToggleFavorite }) {
    const { currentSong, is432Hz, isConverting, tuningDetails, conversionProgress, isBuffering } = usePlayer();
    const isFav = favoriteSongs?.some((s) => s.id === currentSong?.id);

    return (
        <AnimatePresence>
            {isOpen && currentSong && (
                <motion.div
                    initial={{ opacity: 0, y: "100%" }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: "100%" }}
                    transition={{ type: "spring", stiffness: 260, damping: 30 }}
                    className="fixed inset-0 z-[60] flex flex-col overflow-hidden"
                    style={{
                        background: "linear-gradient(160deg, #0e0e1a 0%, #14141f 60%, #1a0e2a 100%)",
                    }}
                >
                    {/* Blurred album art background */}
                    {currentSong.thumbnail && (
                        <div
                            className="absolute inset-0 opacity-20 scale-110 pointer-events-none"
                            style={{
                                backgroundImage: `url(${currentSong.thumbnail})`,
                                backgroundSize: "cover",
                                backgroundPosition: "center",
                                filter: "blur(60px)",
                            }}
                        />
                    )}

                    {/* Scrollable content */}
                    <div className="relative z-10 flex flex-col h-full overflow-y-auto">
                        {/* Top bar */}
                        <div className="flex items-center justify-between px-6 pt-10 pb-4 shrink-0">
                            <button
                                onClick={onClose}
                                className="p-2 rounded-full hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
                            >
                                <Minimize2 size={22} />
                            </button>
                            <div className="text-center">
                                <p className="text-xs text-gray-500 uppercase tracking-widest">Now Playing</p>
                            </div>
                            <button
                                onClick={() => onToggleFavorite?.(currentSong)}
                                className="p-2 rounded-full hover:bg-white/10 transition-colors"
                            >
                                <Heart size={22} className={isFav ? "fill-current text-rose-500" : "text-gray-500"} />
                            </button>
                        </div>

                        {/* Album art */}
                        <div className="flex justify-center px-10 mt-2 shrink-0">
                            <motion.div
                                initial={{ scale: 0.85, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                                className="relative"
                            >
                                {currentSong.thumbnail ? (
                                    <img
                                        src={currentSong.thumbnail}
                                        alt={currentSong.title}
                                        className="w-64 h-64 sm:w-72 sm:h-72 rounded-3xl object-cover shadow-2xl"
                                    />
                                ) : (
                                    <div className="w-64 h-64 sm:w-72 sm:h-72 bg-gradient-to-br from-indigo-500 via-violet-600 to-purple-700 rounded-3xl flex items-center justify-center shadow-2xl">
                                        <Music size={80} className="text-white opacity-40" />
                                    </div>
                                )}

                                {/* Buffering spinner overlay */}
                                <AnimatePresence>
                                    {isBuffering && (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="absolute inset-0 flex items-center justify-center rounded-3xl bg-black/40"
                                        >
                                            <Loader2 size={40} className="text-white animate-spin" />
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* 432Hz overlay badge */}
                                <AnimatePresence>
                                    {(is432Hz || isConverting) && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.8 }}
                                            className={`absolute bottom-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-md ${is432Hz
                                                    ? "bg-emerald-500/30 border border-emerald-500/40 text-emerald-300"
                                                    : "bg-indigo-500/30 border border-indigo-500/40 text-indigo-300"
                                                }`}
                                        >
                                            {isConverting && !is432Hz ? (
                                                <Loader2 size={12} className="animate-spin" />
                                            ) : (
                                                <Zap size={12} className="fill-current" />
                                            )}
                                            <span className="text-xs font-semibold whitespace-nowrap">
                                                {isConverting ? (conversionProgress || "Analyzing tuning...") : (
                                                    tuningDetails?.tuning === "432Hz" ? "Native 432Hz" : "Pitch Shifted to 432Hz"
                                                )}
                                            </span>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        </div>

                        {/* Song info */}
                        <div className="text-center px-8 mt-6 shrink-0">
                            <h1 className="text-2xl font-bold text-white leading-tight truncate">{currentSong.title}</h1>
                            <p className="text-gray-400 mt-1 truncate">{currentSong.artist}</p>
                        </div>

                        {/* Progress */}
                        <div className="px-8 mt-6 shrink-0">
                            <ProgressBar />
                        </div>

                        {/* Controls */}
                        <div className="flex justify-center mt-6 shrink-0">
                            <PlaybackButtons size="large" />
                        </div>

                        {/* Volume */}
                        <div className="flex justify-center mt-6 mb-10 shrink-0">
                            <VolumeControl />
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
