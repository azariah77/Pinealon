// src/components/Playlist/PlaylistCard.jsx
import { motion } from "framer-motion";
import { Music, Heart, Trash2 } from "lucide-react";

export default function PlaylistCard({ playlist, index, onClick, onDelete }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06 }}
            onClick={() => onClick(playlist)}
            className="group relative flex items-center gap-4 p-4 rounded-2xl bg-white/4 border border-white/6 hover:bg-white/8 hover:border-white/12 transition-all duration-200 cursor-pointer"
        >
            {/* Icon */}
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${playlist.isBuiltIn
                    ? "bg-gradient-to-br from-rose-500 to-pink-600"
                    : "bg-gradient-to-br from-indigo-500 to-violet-600"
                }`}>
                {playlist.isBuiltIn ? (
                    <Heart size={22} className="text-white fill-current" />
                ) : (
                    <Music size={22} className="text-white" />
                )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white truncate">{playlist.name}</h3>
                    {playlist.isBuiltIn && (
                        <span className="text-[10px] bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full border border-rose-500/20 shrink-0">
                            Auto
                        </span>
                    )}
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                    {playlist.songs?.length || 0} songs
                </p>
            </div>

            {/* Delete button (non-built-in only) */}
            {!playlist.isBuiltIn && onDelete && (
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(playlist.id); }}
                    className="opacity-0 group-hover:opacity-100 p-2 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all"
                    title="Delete playlist"
                >
                    <Trash2 size={15} />
                </button>
            )}
        </motion.div>
    );
}
