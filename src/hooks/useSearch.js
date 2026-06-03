// src/hooks/useSearch.js
import { useState, useRef, useCallback } from "react";
import { searchYouTube } from "../services/api.js";

export function useSearch() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState(null);
    const debounceRef = useRef(null);

    const search = useCallback((q) => {
        setQuery(q);
        setError(null);

        clearTimeout(debounceRef.current);

        if (!q.trim()) {
            setResults([]);
            return;
        }

        debounceRef.current = setTimeout(async () => {
            setIsSearching(true);
            try {
                const data = await searchYouTube(q, 15);
                setResults(data.results || []);
            } catch (err) {
                setError(err.message);
                setResults([]);
            } finally {
                setIsSearching(false);
            }
        }, 420);
    }, []);

    const clearSearch = useCallback(() => {
        clearTimeout(debounceRef.current);
        setQuery("");
        setResults([]);
        setError(null);
        setIsSearching(false);
    }, []);

    return { query, results, isSearching, error, search, clearSearch };
}
