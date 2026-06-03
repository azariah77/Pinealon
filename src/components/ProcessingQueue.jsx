// src/components/ProcessingQueue.jsx
// Toast-style notifications for background 432Hz conversions.

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, XCircle, Loader2, Zap, X } from "lucide-react";

const STATUS_CONFIG = {
    queued: { icon: Loader2, color: "text-gray-400", bg: "bg-white/5", label: "Queued…", spin: true },
    downloading: { icon: Loader2, color: "text-blue-400", bg: "bg-blue-500/10", label: "Downloading…", spin: true },
    converting: { icon: Loader2, color: "text-indigo-400", bg: "bg-indigo-500/10", label: "Converting to 432Hz…", spin: true },
    completed: { icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10", label: "Ready in 432Hz!" },
    cached: { icon: Zap, color: "text-emerald-400", bg: "bg-emerald-500/10", label: "432Hz (cached)" },
    error: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10", label: "Failed" },
};

function QueueItem({ item, onDismiss }) {
    const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.queued;
    const Icon = cfg.icon;
    const isDone = item.status === "completed" || item.status === "cached" || item.status === "error";

    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: 60, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className={`flex items-center gap-3 p-3 rounded-xl border border-white/8 backdrop-blur-md ${cfg.bg} min-w-[260px] max-w-[320px]`}
        >
            {/* Thumbnail */}
            {item.thumbnail && (
                <img src={item.thumbnail} alt={item.title} className="w-10 h-10 rounded-lg object-cover shrink-0" />
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
                <p className="text-xs text-white truncate font-medium">{item.title}</p>
                <div className={`flex items-center gap-1 mt-0.5 ${cfg.color}`}>
                    <Icon size={11} className={cfg.spin ? "animate-spin" : ""} />
                    <span className="text-[11px]">{cfg.label}</span>
                </div>
            </div>

            {/* Dismiss */}
            {isDone && (
                <button
                    onClick={() => onDismiss(item.id)}
                    className="shrink-0 p-1 rounded-full text-gray-600 hover:text-gray-300 hover:bg-white/10 transition-colors"
                >
                    <X size={12} />
                </button>
            )}
        </motion.div>
    );
}

export default function ProcessingQueue({ items, onDismiss }) {
    const visible = items.slice(0, 4); // Show max 4

    return (
        <div className="fixed bottom-28 right-4 z-50 flex flex-col gap-2 items-end pointer-events-none">
            <AnimatePresence mode="popLayout">
                {visible.map((item) => (
                    <div key={item.id} className="pointer-events-auto">
                        <QueueItem item={item} onDismiss={onDismiss} />
                    </div>
                ))}
            </AnimatePresence>
        </div>
    );
}
