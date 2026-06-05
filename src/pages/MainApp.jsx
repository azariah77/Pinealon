// src/pages/MainApp.jsx  — v2: Search-first, component-driven, ~300 lines vs 1375

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Music, Plus, X, Home, Library, LogOut, Settings,
  Heart, ArrowLeft, List as ListIcon,
} from "lucide-react";
import { auth } from "../firebase.js";
import { signOut } from "firebase/auth";
import { PinealonBackend } from "../backend-services.js";
import { usePlayer } from "../context/PlayerContext.jsx";
import { useSearch } from "../hooks/useSearch.js";

// Components
import SearchBar from "../components/SearchBar.jsx";
import SearchResults from "../components/SearchResults.jsx";
import PlaylistCard from "../components/Playlist/PlaylistCard.jsx";
import SongCard from "../components/SongCard.jsx";
import MiniPlayer from "../components/Player/MiniPlayer.jsx";
import FullPlayer from "../components/Player/FullPlayer.jsx";

// ── Sidebar nav items ──────────────────────────────────────────────────────

const NAV = [
  { id: "home", icon: Home, label: "Discover" },
  { id: "library", icon: Library, label: "Library" },
];

// ── Add-to-playlist modal ──────────────────────────────────────────────────

function PlaylistSelectorModal({ song, playlists, onSelect, onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-[#1a1a28] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
      >
        <h3 className="text-lg font-semibold mb-1">Add to Playlist</h3>
        <p className="text-sm text-gray-500 mb-4">
          Will be converted to <span className="text-indigo-400 font-medium">432Hz</span> in the background.
        </p>
        <div className="space-y-1.5 max-h-52 overflow-y-auto">
          {playlists.map((pl) => (
            <button
              key={pl.id}
              onClick={() => { onSelect(pl); onClose(); }}
              className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/6 transition-colors text-left"
            >
              <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center shrink-0">
                <Music size={14} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">{pl.name}</p>
                <p className="text-xs text-gray-500">{pl.songs?.length || 0} songs</p>
              </div>
            </button>
          ))}
          {playlists.length === 0 && (
            <p className="text-center text-gray-500 text-sm py-6">No playlists yet</p>
          )}
        </div>
        <button onClick={onClose} className="mt-4 w-full py-2 text-sm text-gray-400 hover:text-white transition-colors">
          Cancel
        </button>
      </motion.div>
    </motion.div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────

export default function MainApp() {
  // ── Auth / backend ────────────────────────────────────────────────────
  const [user, setUser] = useState(null);
  const [backend, setBackend] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // ── Playlists / favorites ─────────────────────────────────────────────
  const [playlists, setPlaylists] = useState([]);
  const [favoriteSongs, setFavoriteSongs] = useState([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);

  // ── UI state ──────────────────────────────────────────────────────────
  const [activeNav, setActiveNav] = useState("home");
  const [showAddPlaylist, setShowAddPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [showExpandedPlayer, setShowExpandedPlayer] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [songForPlaylist, setSongForPlaylist] = useState(null); // triggers modal

  // ── Hooks ─────────────────────────────────────────────────────────────
  const { query, results, isSearching, error: searchError, search, clearSearch } = useSearch();
  const { playSong, addToQueue, queue, queueIndex, isPlaying, currentSong, formatTime, currentTime, duration } = usePlayer();

  // ── Auth init ─────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (u) {
        setUser(u);
        setIsLoading(true);
        const be = new PinealonBackend(u.uid);
        setBackend(be);
        try {
          const [pls, favs] = await Promise.all([be.getUserPlaylists(), be.getFavoriteSongs()]);
          setPlaylists(pls || []);
          setFavoriteSongs(favs || []);
        } catch { setPlaylists([]); }
        setIsLoading(false);
      } else {
        setUser(null); setBackend(null); setPlaylists([]); setFavoriteSongs([]);
        setIsLoading(false);
      }
    });
    return unsub;
  }, []);

  // ── Playlist CRUD ─────────────────────────────────────────────────────
  const handleAddPlaylist = async () => {
    if (!newPlaylistName.trim() || !backend) return;
    const pl = await backend.createPlaylist(newPlaylistName.trim());
    setPlaylists((prev) => [...prev, pl]);
    setNewPlaylistName(""); setShowAddPlaylist(false);
  };

  const handleDeletePlaylist = async (id) => {
    if (!backend) return;
    await backend.deletePlaylist(id);
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
    if (selectedPlaylist?.id === id) setSelectedPlaylist(null);
  };

  // ── Favorites ─────────────────────────────────────────────────────────
  const toggleFavorite = async (song) => {
    if (!backend) return;
    const already = favoriteSongs.some((s) => s.id === song.id);
    if (already) {
      await backend.removeSongFromFavorites(song.id);
      setFavoriteSongs((prev) => prev.filter((s) => s.id !== song.id));
    } else {
      const s = { ...song, addedToFavoritesAt: new Date() };
      await backend.addSongToFavorites(s);
      setFavoriteSongs((prev) => [...prev, s]);
    }
  };

  const removeSongFromPlaylist = async (playlistId, songId) => {
    if (!backend) return;
    if (playlistId === "favorites") {
      await backend.removeSongFromFavorites(songId);
      setFavoriteSongs((prev) => prev.filter((s) => s.id !== songId));
    } else {
      await backend.removeSongFromPlaylist(playlistId, songId);
      setPlaylists((prev) =>
        prev.map((p) =>
          p.id === playlistId ? { ...p, songs: p.songs.filter((s) => s.id !== songId) } : p
        )
      );
      setSelectedPlaylist((prev) =>
        prev?.id === playlistId
          ? { ...prev, songs: prev.songs.filter((s) => s.id !== songId) }
          : prev
      );
    }
  };

  // ── Add song to playlist (from search result) ─────────────────────────
  const handleAddSongToPlaylist = useCallback(async (song, playlist) => {
    if (!backend) return;
    const songData = {
      ...song,
      addedAt: new Date(),
    };
    const added = await backend.addSongToPlaylist(playlist.id, songData);
    setPlaylists((prev) =>
      prev.map((p) =>
        p.id === playlist.id ? { ...p, songs: [...(p.songs || []), added] } : p
      )
    );
    if (selectedPlaylist?.id === playlist.id) {
      setSelectedPlaylist((prev) => ({ ...prev, songs: [...(prev.songs || []), added] }));
    }
  }, [backend, selectedPlaylist]);

  // ── Download song ────────────────────────────────────────────────────────
  const handleDownloadSong = async (song) => {
    // Basic download trigger
    window.open(`http://localhost:3001/api/download/${song.videoId}`, "_blank");
  };

  // ── Derived ────────────────────────────────────────────────────────────
  const favoritePlaylist = { id: "favorites", name: "Favorite Songs", songs: favoriteSongs, isBuiltIn: true };
  const allPlaylists = [favoritePlaylist, ...playlists];

  const getUserInitials = () => {
    if (user?.displayName) return user.displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
    if (user?.email) return user.email.slice(0, 2).toUpperCase();
    return "U";
  };

  // ── Active playlist for detail view ───────────────────────────────────
  const playlistForDetail = selectedPlaylist
    ? allPlaylists.find((p) => p.id === selectedPlaylist.id) ?? selectedPlaylist
    : null;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen flex flex-col text-white select-none"
      style={{ background: "linear-gradient(150deg, #0b0b14 0%, #111120 60%, #0f0b1a 100%)" }}
      onClick={() => { setShowProfile(false); }}
    >
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-4 border-b border-white/6 shrink-0">
        {/* Logo */}
        <h1
          className="text-xl font-black tracking-wider drop-shadow-[0_0_12px_#6366f180]"
          style={{ fontFamily: "Orbitron, sans-serif", color: "#818cf8" }}
        >
          PINEALON
        </h1>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-1">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => { setActiveNav(item.id); setSelectedPlaylist(null); clearSearch(); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeNav === item.id
                ? "bg-indigo-500/20 text-indigo-300"
                : "text-gray-400 hover:text-white hover:bg-white/6"
                }`}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          ))}
        </nav>

        {/* Profile */}
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setShowProfile(!showProfile)}
            className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-600 p-0.5"
          >
            <div className="w-full h-full rounded-full bg-[#111120] flex items-center justify-center overflow-hidden">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs font-bold">{getUserInitials()}</span>
              )}
            </div>
          </button>

          <AnimatePresence>
            {showProfile && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -8 }}
                className="absolute right-0 top-12 w-56 bg-[#1a1a28] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
              >
                <div className="p-4 border-b border-white/8">
                  <p className="font-semibold text-sm truncate">{user?.displayName || user?.email?.split("@")[0]}</p>
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                </div>
                <div className="py-1">
                  <button className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-300 hover:bg-white/6 transition-colors">
                    <Settings size={15} /> Settings
                  </button>
                  <div className="border-t border-white/8 my-1" />
                  <button
                    onClick={() => signOut(auth)}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <LogOut size={15} /> Sign Out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────── */}
      <main className={`flex-1 overflow-y-auto px-4 py-6 ${currentSong ? "pb-28" : ""}`}>

        {/* ── DISCOVER (home) ──── */}
        {activeNav === "home" && !selectedPlaylist && (
          <motion.div key="home" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto">
            {/* Hero text */}
            {!query && (
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-white mb-2">
                  Discover Music in <span className="text-indigo-400">432Hz</span>
                </h2>
                <p className="text-gray-500 text-sm">Search any song and play it instantly.</p>
              </div>
            )}

            <SearchBar query={query} onSearch={search} isSearching={isSearching} />

            <SearchResults
              results={results}
              query={query}
              isSearching={isSearching}
              error={searchError}
              onAddToPlaylist={(song) => setSongForPlaylist(song)}
              onDownload={handleDownloadSong}
            />
          </motion.div>
        )}

        {/* ── LIBRARY ──── */}
        {activeNav === "library" && !selectedPlaylist && (
          <motion.div key="library" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">My Library</h2>
              <button
                onClick={() => setShowAddPlaylist(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 rounded-xl text-sm font-medium transition-colors"
              >
                <Plus size={15} /> New Playlist
              </button>
            </div>

            {/* Create playlist form */}
            <AnimatePresence>
              {showAddPlaylist && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden mb-4"
                >
                  <div className="p-4 bg-white/4 border border-white/8 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        placeholder="Playlist name…"
                        value={newPlaylistName}
                        onChange={(e) => setNewPlaylistName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddPlaylist()}
                        className="flex-1 px-4 py-2.5 bg-white/6 border border-white/10 rounded-xl text-sm outline-none focus:border-indigo-500/50 transition-colors"
                        autoFocus
                      />
                      <button
                        onClick={handleAddPlaylist}
                        disabled={!newPlaylistName.trim()}
                        className="px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-700 rounded-xl text-sm font-medium transition-colors"
                      >
                        Create
                      </button>
                      <button onClick={() => { setShowAddPlaylist(false); setNewPlaylistName(""); }} className="p-2 text-gray-500 hover:text-white">
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {isLoading ? (
              <div className="flex justify-center py-16">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-2">
                {allPlaylists.map((pl, i) => (
                  <PlaylistCard
                    key={pl.id}
                    playlist={pl}
                    index={i}
                    onClick={(p) => setSelectedPlaylist(p)}
                    onDelete={!pl.isBuiltIn ? handleDeletePlaylist : undefined}
                  />
                ))}
                {allPlaylists.length === 1 && (
                  <div className="text-center py-12 text-gray-600">
                    <Music size={40} className="mx-auto mb-3 opacity-30" />
                    <p>No custom playlists yet</p>
                    <p className="text-sm mt-1">Create one to start adding music!</p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* ── PLAYLIST DETAIL ──── */}
        {selectedPlaylist && (
          <motion.div key="detail" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
              <button
                onClick={() => setSelectedPlaylist(null)}
                className="p-2 rounded-xl hover:bg-white/6 transition-colors text-gray-400 hover:text-white"
              >
                <ArrowLeft size={20} />
              </button>
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${playlistForDetail?.isBuiltIn
                ? "bg-gradient-to-br from-rose-500 to-pink-600"
                : "bg-gradient-to-br from-indigo-500 to-violet-600"
                }`}>
                {playlistForDetail?.isBuiltIn ? <Heart size={22} className="text-white fill-current" /> : <Music size={22} className="text-white" />}
              </div>
              <div>
                <h2 className="text-2xl font-bold">{playlistForDetail?.name}</h2>
                <p className="text-gray-500 text-sm">{playlistForDetail?.songs?.length || 0} songs</p>
              </div>
            </div>

            {/* Songs */}
            {(!playlistForDetail?.songs || playlistForDetail.songs.length === 0) ? (
              <div className="text-center py-16 text-gray-600">
                <Music size={40} className="mx-auto mb-3 opacity-30" />
                <p>No songs yet</p>
                <p className="text-sm mt-1">Search for songs and add them here.</p>
                <button
                  onClick={() => { setActiveNav("home"); setSelectedPlaylist(null); }}
                  className="mt-4 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 rounded-xl text-sm transition-colors"
                >
                  Discover Music
                </button>
              </div>
            ) : (
              <div className="space-y-1.5 pb-20">
                {playlistForDetail.songs.map((song, i) => (
                  <SongCard
                    key={song.id || i}
                    song={song}
                    index={i}
                    playlist={playlistForDetail}
                    favoriteSongs={favoriteSongs}
                    onToggleFavorite={toggleFavorite}
                    onRemove={(songId) => removeSongFromPlaylist(playlistForDetail.id, songId)}
                    onAddToQueue={addToQueue}
                    onDownload={handleDownloadSong}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </main>

      {/* ── Mobile bottom nav ────────────────────────────────── */}
      <nav className={`sm:hidden flex border-t border-white/6 ${currentSong ? "hidden" : ""}`}>
        {NAV.map((item) => (
          <button
            key={item.id}
            onClick={() => { setActiveNav(item.id); setSelectedPlaylist(null); clearSearch(); }}
            className={`flex-1 flex flex-col items-center py-3 gap-1 text-xs transition-colors ${activeNav === item.id ? "text-indigo-400" : "text-gray-500 hover:text-gray-300"
              }`}
          >
            <item.icon size={20} />
            {item.label}
          </button>
        ))}
      </nav>

      {/* ── Modals ────────────────────────────────────────────── */}
      <AnimatePresence>
        {songForPlaylist && (
          <PlaylistSelectorModal
            song={songForPlaylist}
            playlists={playlists}
            onSelect={(pl) => handleAddSongToPlaylist(songForPlaylist, pl)}
            onClose={() => setSongForPlaylist(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Player ────────────────────────────────────────────── */}
      <MiniPlayer
        favoriteSongs={favoriteSongs}
        onToggleFavorite={toggleFavorite}
        onExpand={() => setShowExpandedPlayer(true)}
      />
      <FullPlayer
        isOpen={showExpandedPlayer}
        onClose={() => setShowExpandedPlayer(false)}
        favoriteSongs={favoriteSongs}
        onToggleFavorite={toggleFavorite}
      />
    </div>
  );
}