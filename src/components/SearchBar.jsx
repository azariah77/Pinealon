// src/components/SearchBar.jsx
import { useRef } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function SearchBar({ query, onSearch, isSearching, placeholder = "Search songs, artists…" }) {
    const inputRef = useRef(null);

    return (
        <div className="relative w-full max-w-2xl mx-auto">
            <div className="relative flex items-center">
                <div className="absolute left-4 flex items-center pointer-events-none">
                    <AnimatePresence mode="wait">
                        {isSearching ? (
                            <motion.div key="spin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                <Loader2 size={18} className="text-indigo-400 animate-spin" />
                            </motion.div>
                        ) : (
                            <motion.div key="icon" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                <Search size={18} className="text-gray-400" />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => onSearch(e.target.value)}
                    placeholder={placeholder}
                    className="w-full pl-11 pr-10 py-3.5 bg-white/8 border border-white/10 hover:border-white/20 focus:border-indigo-500/60 focus:bg-white/10 rounded-2xl text-sm text-white placeholder-gray-500 outline-none transition-all duration-200 backdrop-blur-sm"
                    style={{ caretColor: "#818cf8" }}
                />

                <AnimatePresence>
                    {query && (
                        <motion.button
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            onClick={() => { onSearch(""); inputRef.current?.focus(); }}
                            className="absolute right-3 p-1.5 text-gray-500 hover:text-white rounded-full hover:bg-white/10 transition-all"
                        >
                            <X size={14} />
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
