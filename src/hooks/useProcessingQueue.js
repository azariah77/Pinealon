// src/hooks/useProcessingQueue.js
// Lightweight queue manager for tracking per-song 432Hz conversion toasts.

import { useState, useCallback } from "react";
import * as api from "../services/api.js";

/**
 * Each queue item:
 * {
 *   id: string          – internal id
 *   videoId: string
 *   title: string
 *   status: "queued" | "downloading" | "converting" | "completed" | "error" | "cached"
 *   jobId: string | null
 *   fileUrl: string | null
 *   fileName: string | null
 *   error: string | null
 * }
 */

export function useProcessingQueue() {
    const [items, setItems] = useState([]);

    const update = useCallback((id, patch) => {
        setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    }, []);

    const enqueue = useCallback(
        async (song, options = {}) => {
            const id = `${song.videoId}_${Date.now()}`;

            // Add to queue immediately
            setItems((prev) => [
                {
                    id,
                    videoId: song.videoId,
                    title: song.title,
                    thumbnail: song.thumbnail,
                    status: "queued",
                    jobId: null,
                    fileUrl: null,
                    fileName: null,
                    error: null,
                },
                ...prev,
            ]);

            try {
                // Check cache first (instant)
                const cache = await api.checkCache(song.videoId);
                if (cache.cached) {
                    update(id, {
                        status: "cached",
                        fileUrl: api.getFileUrl(cache.filename),
                        fileName: cache.filename,
                    });
                    if (options.autoDownload) {
                        window.open(api.getDownloadUrl(cache.filename), "_blank");
                    }
                    return {
                        status: "cached",
                        fileUrl: api.getFileUrl(cache.filename),
                        fileName: cache.filename,
                    };
                }

                // Start background conversion
                const result = await api.startConversion(song.videoId, options);

                if (result.status === "completed") {
                    const fname = result.fileName || (result.fileUrl || "").split("/api/files/")[1];
                    update(id, {
                        status: "cached",
                        fileUrl: api.getFileUrl(fname),
                        fileName: fname,
                    });
                    if (options.autoDownload) {
                        window.open(api.getDownloadUrl(fname), "_blank");
                    }
                    return { status: "cached", fileUrl: api.getFileUrl(fname), fileName: fname };
                }

                // Poll until done
                update(id, { status: "downloading", jobId: result.jobId });

                const poll = setInterval(async () => {
                    try {
                        const s = await api.getJobStatus(result.jobId);
                        if (s.status === "completed") {
                            clearInterval(poll);
                            const fname = s.fileName || (s.fileUrl || "").split("/api/files/")[1];
                            update(id, {
                                status: "completed",
                                fileUrl: api.getFileUrl(fname),
                                fileName: fname,
                            });
                            if (options.autoDownload) {
                                window.open(api.getDownloadUrl(fname), "_blank");
                            }
                        } else if (s.status === "error") {
                            clearInterval(poll);
                            update(id, { status: "error", error: s.error });
                        } else {
                            update(id, { status: s.status });
                        }
                    } catch { /* retry */ }
                }, 2500);

                return { status: "processing", queueId: id };
            } catch (err) {
                update(id, { status: "error", error: err.message });
                return { status: "error", error: err.message };
            }
        },
        [update]
    );

    const dismiss = useCallback((id) => {
        setItems((prev) => prev.filter((it) => it.id !== id));
    }, []);

    const dismissAll = useCallback(() => {
        setItems((prev) => prev.filter((it) => it.status === "downloading" || it.status === "converting"));
    }, []);

    const activeCount = items.filter(
        (it) => it.status === "downloading" || it.status === "converting" || it.status === "queued"
    ).length;

    return { items, enqueue, dismiss, dismissAll, activeCount };
}
