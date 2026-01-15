import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Music, Download, Plus, X, MoreVertical, Edit3, Trash2, Play, Heart, Share, ArrowLeft, User, LogOut, Settings, Pause, SkipBack, SkipForward, Volume2, VolumeX, Repeat, Shuffle, List, Minimize2, Maximize2 } from "lucide-react";
import { PinealonBackend } from '../backend-services.js';
import { auth } from '../firebase.js';
import { signOut } from 'firebase/auth';

export default function MainApp() {
  const [tab, setTab] = useState("playlist");
  const [playlists, setPlaylists] = useState([]);
  const [showAddPlaylist, setShowAddPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [activeMenu, setActiveMenu] = useState(null);
  const [editingPlaylist, setEditingPlaylist] = useState(null);
  const [editName, setEditName] = useState("");
  const [currentView, setCurrentView] = useState("playlists");
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [songMenuActive, setSongMenuActive] = useState(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [backend, setBackend] = useState(null);
  const [user, setUser] = useState(null);
  const [favoriteSongs, setFavoriteSongs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showPlaylistSelector, setShowPlaylistSelector] = useState(false);
  const [selectedPlaylistForAdd, setSelectedPlaylistForAdd] = useState(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  // Music Player States
  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [queue, setQueue] = useState([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  const [showExpandedPlayer, setShowExpandedPlayer] = useState(false);
  const [showQueue, setShowQueue] = useState(false);

  const audioRef = useRef(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setUser(user);
        setIsLoading(true);
        
        const userBackend = new PinealonBackend(user.uid);
        setBackend(userBackend);
        
        try {
          const userPlaylists = await userBackend.getUserPlaylists();
          setPlaylists(userPlaylists || []);
          
          const favorites = await userBackend.getFavoriteSongs();
          setFavoriteSongs(favorites || []);
          
        } catch (error) {
          console.error("Error loading data:", error);
          setPlaylists([]);
        }
        
        setIsLoading(false);
      } else {
        setUser(null);
        setBackend(null);
        setPlaylists([]);
        setFavoriteSongs([]);
        setIsLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  // Audio element event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration);
    const handleEnded = () => handleSongEnd();
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [queue, currentQueueIndex, isRepeat, isShuffle]);

  const favoritePlaylist = {
    id: 'favorites',
    name: 'Favorite Songs',
    songs: favoriteSongs,
    isBuiltIn: true,
    isFavorite: true,
    createdAt: new Date(),
    lastPlayed: null
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setShowProfileMenu(false);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const handleAddPlaylist = async () => {
    if (!newPlaylistName.trim() || !backend) return;
    
    try {
      const newPlaylist = await backend.createPlaylist(newPlaylistName.trim());
      setPlaylists(prevPlaylists => [...prevPlaylists, newPlaylist]);
      setNewPlaylistName("");
      setShowAddPlaylist(false);
    } catch (error) {
      console.error('Error creating playlist:', error);
      alert('Failed to create playlist: ' + error.message);
    }
  };

  const refreshPlaylists = async () => {
    if (!backend) return;
    
    try {
      setIsLoading(true);
      const userPlaylists = await backend.getUserPlaylists();
      setPlaylists(userPlaylists || []);
      const favorites = await backend.getFavoriteSongs();
      setFavoriteSongs(favorites || []);
    } catch (error) {
      console.error('Error refreshing playlists:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeletePlaylist = async (playlistId) => {
    if (!backend) return;
    
    try {
      await backend.deletePlaylist(playlistId);
      setPlaylists(playlists.filter(playlist => playlist.id !== playlistId));
      setActiveMenu(null);
    } catch (error) {
      console.error('Error deleting playlist:', error);
    }
  };

  const toggleSongFavorite = async (song) => {
    if (!backend) return;
    
    try {
      const isAlreadyFavorite = favoriteSongs.some(favSong => favSong.id === song.id);
      
      if (isAlreadyFavorite) {
        await backend.removeSongFromFavorites(song.id);
        setFavoriteSongs(favoriteSongs.filter(favSong => favSong.id !== song.id));
      } else {
        const favoriteSong = { ...song, addedToFavoritesAt: new Date() };
        await backend.addSongToFavorites(favoriteSong);
        setFavoriteSongs([...favoriteSongs, favoriteSong]);
      }
      setSongMenuActive(null);
    } catch (error) {
      console.error('Error toggling song favorite:', error);
      alert('Error updating favorites');
    }
  };

  const removeSongFromPlaylist = async (playlistId, songId) => {
    if (!backend) return;
    
    try {
      if (playlistId === 'favorites') {
        await backend.removeSongFromFavorites(songId);
        setFavoriteSongs(favoriteSongs.filter(song => song.id !== songId));
      } else {
        await backend.removeSongFromPlaylist(playlistId, songId);
        setPlaylists(playlists.map(playlist =>
          playlist.id === playlistId
            ? { ...playlist, songs: playlist.songs.filter(song => song.id !== songId) }
            : playlist
        ));
      }
      setSongMenuActive(null);
    } catch (error) {
      console.error('Error removing song:', error);
      alert('Error removing song');
    }
  };

  const openPlaylistDetail = (playlist) => {
    setSelectedPlaylist(playlist);
    setCurrentView("playlist-detail");
    setActiveMenu(null);
  };

  const processYouTubeUrl = async (action, targetPlaylistId = null) => {
    if (!youtubeUrl.trim()) {
      alert('Please enter a YouTube URL');
      return;
    }
    
    setIsProcessing(true);
    try {
      const { YouTubeProcessor } = await import('../services/youtube-processor.js');
      const processor = new YouTubeProcessor(user?.uid);
      
      const result = await processor.processYouTubeUrl(
        youtubeUrl.trim(),
        action,
        targetPlaylistId
      );
      
      if (result.success) {
        if (action === 'download') {
          let downloadUrl = result.downloadUrl || result.fileUrl || result.conversionDetails?.downloadUrl;
          
          if (downloadUrl) {
            if (!downloadUrl.startsWith('http')) {
              downloadUrl = 'http://localhost:3001' + downloadUrl;
            }
            window.location.href = downloadUrl;
            setTimeout(() => {
              alert(`"${result.songData.title}" downloaded successfully!`);
            }, 1000);
          }
        } else if (action === 'add-to-playlist') {
          await refreshPlaylists();
          const targetPlaylist = playlists.find(p => p.id === targetPlaylistId);
          alert(`Success!\n\n"${result.songData.title}"\n\nConverted to 432Hz\nAdded to "${targetPlaylist?.name || 'playlist'}"`);
        }
        
        setYoutubeUrl("");
      } else {
        throw new Error(result.error || result.message || 'Processing failed');
      }
      
    } catch (error) {
      console.error('YouTube processing error:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Music Player Functions
  const playSong = (song, playlistSongs = [], playlistId = null) => {
    if (!song || !song.convertedAudioUrl) {
      alert('Audio file not available for this song');
      return;
    }

    // Set up queue from playlist
    const newQueue = playlistSongs.length > 0 ? playlistSongs : [song];
    const songIndex = newQueue.findIndex(s => s.id === song.id);
    
    setQueue(newQueue);
    setCurrentQueueIndex(songIndex >= 0 ? songIndex : 0);
    setCurrentSong({ ...song, playlistId });
    
    // Play audio
    if (audioRef.current) {
      audioRef.current.src = song.convertedAudioUrl;
      audioRef.current.load();
      audioRef.current.play().catch(err => {
        console.error('Error playing audio:', err);
        alert('Failed to play audio. Please try again.');
      });
    }
  };

  const togglePlayPause = () => {
    if (!audioRef.current || !currentSong) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(err => {
        console.error('Error playing audio:', err);
      });
    }
  };

  const handleSongEnd = () => {
    if (isRepeat) {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
    } else {
      playNext();
    }
  };

  const playNext = () => {
    if (queue.length === 0) return;

    let nextIndex;
    if (isShuffle) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else {
      nextIndex = (currentQueueIndex + 1) % queue.length;
    }

    const nextSong = queue[nextIndex];
    setCurrentQueueIndex(nextIndex);
    setCurrentSong(nextSong);
    
    if (audioRef.current && nextSong.convertedAudioUrl) {
      audioRef.current.src = nextSong.convertedAudioUrl;
      audioRef.current.load();
      audioRef.current.play();
    }
  };

  const playPrevious = () => {
    if (queue.length === 0) return;

    if (currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }

    const prevIndex = currentQueueIndex === 0 ? queue.length - 1 : currentQueueIndex - 1;
    const prevSong = queue[prevIndex];
    
    setCurrentQueueIndex(prevIndex);
    setCurrentSong(prevSong);
    
    if (audioRef.current && prevSong.convertedAudioUrl) {
      audioRef.current.src = prevSong.convertedAudioUrl;
      audioRef.current.load();
      audioRef.current.play();
    }
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * duration;
    
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleVolumeChange = (newVolume) => {
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
    if (newVolume === 0) {
      setIsMuted(true);
    } else {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    if (isMuted) {
      handleVolumeChange(volume || 0.5);
    } else {
      handleVolumeChange(0);
    }
  };

  const addToQueue = (song) => {
    setQueue([...queue, song]);
    setSongMenuActive(null);
    alert(`"${song.title}" added to queue`);
  };

  const formatTime = (seconds) => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getUserInitials = () => {
    if (user?.displayName) {
      return user.displayName
        .split(' ')
        .map(name => name[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    if (user?.email) {
      return user.email.slice(0, 2).toUpperCase();
    }
    return 'U';
  };

  const allPlaylists = [favoritePlaylist, ...playlists];

  const handleGlobalClick = () => {
    setActiveMenu(null);
    setSongMenuActive(null);
    setShowProfileMenu(false);
    setShowPlaylistSelector(false);
  };

  const isSongFavorited = (songId) => {
    return favoriteSongs.some(favSong => favSong.id === songId);
  };

  return (
    <div 
      className="min-h-screen bg-gradient-to-br from-[#0d0d0d] to-[#1a1a1a] text-white flex flex-col"
      onClick={handleGlobalClick}
    >
      {/* Audio Element */}
      <audio ref={audioRef} />

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <h1
          className="text-2xl font-bold drop-shadow-[0_0_6px_#4263eb60]"
          style={{ fontFamily: "Orbitron, sans-serif", color: "#4263eb" }}
        >
          PINEALON
        </h1>
        
        <div className="flex items-center gap-4">
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowProfileMenu(!showProfileMenu);
              }}
              className="relative group"
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-pink-500 via-red-500 to-yellow-500 p-0.5">
                <div className="w-full h-full rounded-full bg-[#1a1a1a] flex items-center justify-center">
                  {user?.photoURL ? (
                    <img 
                      src={user.photoURL} 
                      alt="Profile" 
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-bold text-white">
                      {getUserInitials()}
                    </span>
                  )}
                </div>
              </div>
            </button>

            <AnimatePresence>
              {showProfileMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  transition={{ duration: 0.15 }}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-12 w-64 bg-[#2c2c2e] border border-white/20 rounded-lg shadow-xl z-50"
                >
                  <div className="p-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-pink-500 via-red-500 to-yellow-500 p-0.5">
                        <div className="w-full h-full rounded-full bg-[#1a1a1a] flex items-center justify-center">
                          {user?.photoURL ? (
                            <img 
                              src={user.photoURL} 
                              alt="Profile" 
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          ) : (
                            <span className="text-lg font-bold text-white">
                              {getUserInitials()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white truncate">
                          {user?.displayName || user?.email?.split('@')[0] || 'User'}
                        </p>
                        <p className="text-sm text-gray-400 truncate">{user?.email}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="px-4 py-3 bg-white/5">
                    <div className="flex justify-between text-center">
                      <div>
                        <p className="text-lg font-bold text-white">{playlists.length}</p>
                        <p className="text-xs text-gray-400">Playlists</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-white">{favoriteSongs.length}</p>
                        <p className="text-xs text-gray-400">Favorites</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-white">
                          {allPlaylists.reduce((total, playlist) => total + (playlist.songs?.length || 0), 0)}
                        </p>
                        <p className="text-xs text-gray-400">Total Songs</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="py-1">
                    <button
                      onClick={() => setShowProfileMenu(false)}
                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors"
                    >
                      <Settings size={18} />
                      Settings
                    </button>
                    
                    <div className="border-t border-white/10 my-1"></div>
                    
                    <button
                      onClick={handleSignOut}
                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <LogOut size={18} />
                      Sign Out
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={`flex-1 flex flex-col ${currentSong ? 'pb-24' : ''}`}>
        {tab === "download" ? (
          <motion.div
            key="download"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center flex-1 gap-6"
          >
            <h2 className="text-xl font-semibold">Download & Convert</h2>
            <input
              type="text"
              placeholder="Paste YouTube URL..."
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              className="w-72 px-3 py-2 rounded-md bg-[#2c2c2e] text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="flex gap-4">
              <button 
                onClick={() => processYouTubeUrl('download')}
                disabled={isProcessing || !youtubeUrl.trim()}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 rounded-md text-sm font-medium transition-colors"
              >
                {isProcessing ? 'Converting to 432Hz...' : 'Convert & Download'}
              </button>
              
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  if (playlists.length === 0) {
                    alert('Please create a playlist first!');
                    setTab('playlist');
                    return;
                  }
                  setShowPlaylistSelector(true);
                }}
                disabled={isProcessing || !youtubeUrl.trim()}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-600 rounded-md text-sm font-medium transition-colors"
              >
                {isProcessing ? 'Converting...' : 'Add to Playlist'}
              </button>
            </div>
            {isProcessing && (
              <div className="text-center">
                <p className="text-yellow-400 text-sm mb-2">Converting audio to 432Hz tuning...</p>
                <div className="text-xs text-gray-400">This may take a few minutes</div>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="playlist"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col flex-1 p-6"
          >
            {currentView === "playlists" ? (
              <>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold">My Playlists</h2>
                  <button
                    onClick={() => setShowAddPlaylist(true)}
                    className="flex items-center gap-2 px-3 py-2 bg-purple-500 hover:bg-purple-600 rounded-md text-sm"
                  >
                    <Plus size={16} /> Add Playlist
                  </button>
                </div>

                <AnimatePresence>
                  {showAddPlaylist && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, height: 0 }}
                      animate={{ opacity: 1, scale: 1, height: "auto" }}
                      exit={{ opacity: 0, scale: 0.95, height: 0 }}
                      className="mb-4 p-4 bg-[#2c2c2e] rounded-lg border border-white/10 overflow-hidden"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium">Create New Playlist</h3>
                        <button
                          onClick={() => {
                            setShowAddPlaylist(false);
                            setNewPlaylistName("");
                          }}
                          className="text-gray-400 hover:text-white"
                        >
                          <X size={18} />
                        </button>
                      </div>
                      <div className="flex gap-3">
                        <input
                          type="text"
                          placeholder="Playlist name..."
                          value={newPlaylistName}
                          onChange={(e) => setNewPlaylistName(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleAddPlaylist()}
                          className="flex-1 px-3 py-2 rounded-md bg-[#1a1a1a] text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                          autoFocus
                        />
                        <button
                          onClick={handleAddPlaylist}
                          disabled={!newPlaylistName.trim()}
                          className="px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-md text-sm"
                        >
                          Create
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {isLoading && (
                  <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
                    <p>Loading your playlists...</p>
                  </div>
                )}

                {!isLoading && (
                  <div className="flex-1 overflow-y-auto">
                    {allPlaylists.length === 1 ? (
                      <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                        <Music size={48} className="mb-4 opacity-50" />
                        <p className="text-lg">No custom playlists yet</p>
                        <p className="text-sm">Create your first playlist to get started!</p>
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        {allPlaylists.map((playlist, index) => (
                          <motion.div
                            key={playlist.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className="group p-4 bg-[#2c2c2e] rounded-lg border border-white/10 hover:border-white/20 hover:bg-[#323234] transition-all duration-200 cursor-pointer"
                            onClick={() => openPlaylistDetail(playlist)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1">
                                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                                  playlist.isBuiltIn 
                                    ? 'bg-gradient-to-br from-red-500 to-pink-500' 
                                    : 'bg-gradient-to-br from-purple-500 to-pink-500'
                                }`}>
                                  {playlist.isBuiltIn ? (
                                    <Heart size={20} className="text-white fill-current" />
                                  ) : (
                                    <Music size={20} className="text-white" />
                                  )}
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <h3 className="font-medium text-white">{playlist.name}</h3>
                                    {playlist.isBuiltIn && (
                                      <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">
                                        Auto
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-gray-400">
                                    {playlist.songs?.length || 0} songs
                                  </p>
                                </div>
                              </div>
                              
                              {!playlist.isBuiltIn && (
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeletePlaylist(playlist.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-2 bg-red-500 hover:bg-red-600 rounded-full transition-all duration-200"
                                    title="Delete playlist"
                                  >
                                    <Trash2 size={14} className="text-white" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col flex-1">
                <div className="flex items-center gap-4 mb-6">
                  <button
                    onClick={() => setCurrentView("playlists")}
                    className="p-2 hover:bg-white/10 rounded-md transition-colors"
                  >
                    <ArrowLeft size={20} />
                  </button>
                  <div className="flex items-center gap-3">
                    <div className={`w-16 h-16 rounded-lg flex items-center justify-center ${
                      selectedPlaylist?.isBuiltIn 
                        ? 'bg-gradient-to-br from-red-500 to-pink-500' 
                        : 'bg-gradient-to-br from-purple-500 to-pink-500'
                    }`}>
                      {selectedPlaylist?.isBuiltIn ? (
                        <Heart size={24} className="text-white fill-current" />
                      ) : (
                        <Music size={24} className="text-white" />
                      )}
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold">{selectedPlaylist?.name}</h2>
                      <p className="text-gray-400">
                        {selectedPlaylist?.songs?.length || 0} songs
                      </p>
                    </div>
                  </div>
                </div>

                {!selectedPlaylist?.songs || selectedPlaylist.songs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                    <Music size={48} className="mb-4 opacity-50" />
                    <p className="text-lg">No songs yet</p>
                    <p className="text-sm">Add some songs to get started!</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedPlaylist.songs.map((song, index) => (
                      <div
                        key={song.id || index}
                        className={`p-4 bg-[#2c2c2e] rounded-lg border transition-all group ${
                          currentSong?.id === song.id 
                            ? 'border-green-500/50 bg-[#323234]' 
                            : 'border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          {song.thumbnail && (
                            <div className="relative">
                              <img 
                                src={song.thumbnail} 
                                alt={song.title}
                                className="w-16 h-16 rounded object-cover"
                              />
                              {currentSong?.id === song.id && isPlaying && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded">
                                  <div className="flex gap-1">
                                    <div className="w-1 h-4 bg-green-500 animate-pulse" style={{animationDelay: '0ms'}}></div>
                                    <div className="w-1 h-4 bg-green-500 animate-pulse" style={{animationDelay: '150ms'}}></div>
                                    <div className="w-1 h-4 bg-green-500 animate-pulse" style={{animationDelay: '300ms'}}></div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-white truncate">{song.title}</h3>
                            <p className="text-sm text-gray-400">{song.artist}</p>
                            <p className="text-xs text-gray-500">{song.duration}</p>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                if (currentSong?.id === song.id) {
                                  togglePlayPause();
                                } else {
                                  playSong(song, selectedPlaylist.songs, selectedPlaylist.id);
                                }
                              }}
                              className="p-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 rounded-full transition-all shadow-lg hover:shadow-green-500/50 transform hover:scale-105"
                              title={currentSong?.id === song.id && isPlaying ? "Pause" : "Play"}
                            >
                              {currentSong?.id === song.id && isPlaying ? (
                                <Pause size={20} className="text-white" />
                              ) : (
                                <Play size={20} className="text-white ml-0.5" />
                              )}
                            </button>
                            
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSongMenuActive(songMenuActive === song.id ? null : song.id);
                                }}
                                className="p-3 bg-[#3c3c3e] hover:bg-[#4c4c4e] rounded-full transition-colors"
                                title="More options"
                              >
                                <MoreVertical size={18} className="text-white" />
                              </button>
                              
                              <AnimatePresence>
                                {songMenuActive === song.id && (
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="absolute right-0 top-12 w-48 bg-[#2c2c2e] border border-white/20 rounded-lg shadow-xl z-40 overflow-hidden"
                                  >
                                    <button
                                      onClick={() => toggleSongFavorite(song)}
                                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors"
                                    >
                                      <Heart 
                                        size={16} 
                                        className={isSongFavorited(song.id) ? 'fill-current text-red-500' : ''} 
                                      />
                                      {isSongFavorited(song.id) ? 'Remove from Favorites' : 'Add to Favorites'}
                                    </button>
                                    
                                    <button
                                      onClick={() => addToQueue(song)}
                                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors"
                                    >
                                      <List size={16} />
                                      Add to Queue
                                    </button>
                                    
                                    <div className="border-t border-white/10"></div>
                                    
                                    <button
                                      onClick={() => removeSongFromPlaylist(selectedPlaylist.id, song.id)}
                                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                                    >
                                      <Trash2 size={16} />
                                      Remove from Playlist
                                    </button>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* Bottom Music Player Bar */}
      <AnimatePresence>
        {currentSong && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-0 left-0 right-0 bg-gradient-to-r from-[#1a1a1a] via-[#2c2c2e] to-[#1a1a1a] border-t border-white/10 backdrop-blur-xl z-50"
          >
            {/* Progress Bar */}
            <div className="relative h-1 bg-white/10 cursor-pointer group" onClick={handleSeek}>
              <div 
                className="absolute h-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
              <div 
                className="absolute w-3 h-3 bg-white rounded-full top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                style={{ left: `${(currentTime / duration) * 100}%`, marginLeft: '-6px' }}
              />
            </div>

            <div className="px-4 py-3">
              <div className="flex items-center justify-between max-w-screen-xl mx-auto">
                {/* Song Info */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div 
                    className="cursor-pointer"
                    onClick={() => setShowExpandedPlayer(true)}
                  >
                    {currentSong.thumbnail ? (
                      <img 
                        src={currentSong.thumbnail} 
                        alt={currentSong.title}
                        className="w-14 h-14 rounded object-cover"
                      />
                    ) : (
                      <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded flex items-center justify-center">
                        <Music size={24} className="text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-white truncate">{currentSong.title}</h3>
                    <p className="text-sm text-gray-400 truncate">{currentSong.artist}</p>
                  </div>
                  <button
                    onClick={() => toggleSongFavorite(currentSong)}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors"
                  >
                    <Heart 
                      size={18} 
                      className={isSongFavorited(currentSong.id) ? 'fill-current text-red-500' : 'text-gray-400'} 
                    />
                  </button>
                </div>

                {/* Playback Controls */}
                <div className="flex flex-col items-center gap-2 flex-1">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setIsShuffle(!isShuffle)}
                      className={`p-2 rounded-full transition-colors ${
                        isShuffle ? 'text-green-500 bg-green-500/20' : 'text-gray-400 hover:text-white'
                      }`}
                      title="Shuffle"
                    >
                      <Shuffle size={18} />
                    </button>
                    
                    <button
                      onClick={playPrevious}
                      className="p-2 text-gray-400 hover:text-white transition-colors"
                      title="Previous"
                    >
                      <SkipBack size={20} />
                    </button>
                    
                    <button
                      onClick={togglePlayPause}
                      className="p-4 bg-white hover:bg-gray-200 rounded-full transition-all transform hover:scale-105"
                      title={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? (
                        <Pause size={20} className="text-black" />
                      ) : (
                        <Play size={20} className="text-black ml-0.5" />
                      )}
                    </button>
                    
                    <button
                      onClick={playNext}
                      className="p-2 text-gray-400 hover:text-white transition-colors"
                      title="Next"
                    >
                      <SkipForward size={20} />
                    </button>
                    
                    <button
                      onClick={() => setIsRepeat(!isRepeat)}
                      className={`p-2 rounded-full transition-colors ${
                        isRepeat ? 'text-green-500 bg-green-500/20' : 'text-gray-400 hover:text-white'
                      }`}
                      title="Repeat"
                    >
                      <Repeat size={18} />
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span>{formatTime(currentTime)}</span>
                    <span>/</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>

                {/* Volume & Queue */}
                <div className="flex items-center gap-4 flex-1 justify-end">
                  <button
                    onClick={() => setShowQueue(!showQueue)}
                    className="p-2 text-gray-400 hover:text-white transition-colors relative"
                    title="Queue"
                  >
                    <List size={20} />
                    {queue.length > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full text-xs flex items-center justify-center">
                        {queue.length}
                      </span>
                    )}
                  </button>
                  
                  <button
                    onClick={() => setShowExpandedPlayer(true)}
                    className="p-2 text-gray-400 hover:text-white transition-colors"
                    title="Expand"
                  >
                    <Maximize2 size={20} />
                  </button>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleMute}
                      className="p-2 text-gray-400 hover:text-white transition-colors"
                    >
                      {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={volume}
                      onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                      className="w-24 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded Player Modal */}
      <AnimatePresence>
        {showExpandedPlayer && currentSong && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-gradient-to-br from-[#0d0d0d] via-[#1a1a1a] to-[#2c2c2e] z-50 flex flex-col"
            onClick={() => setShowExpandedPlayer(false)}
          >
            <div className="p-6" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setShowExpandedPlayer(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <Minimize2 size={24} />
              </button>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center px-8 pb-32" onClick={(e) => e.stopPropagation()}>
              {/* Large Album Art */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="mb-8"
              >
                {currentSong.thumbnail ? (
                  <img 
                    src={currentSong.thumbnail} 
                    alt={currentSong.title}
                    className="w-80 h-80 rounded-2xl shadow-2xl object-cover"
                  />
                ) : (
                  <div className="w-80 h-80 bg-gradient-to-br from-purple-500 via-pink-500 to-red-500 rounded-2xl shadow-2xl flex items-center justify-center">
                    <Music size={120} className="text-white opacity-50" />
                  </div>
                )}
              </motion.div>

              {/* Song Info */}
              <div className="text-center mb-8 max-w-xl">
                <h1 className="text-4xl font-bold mb-2">{currentSong.title}</h1>
                <p className="text-xl text-gray-400">{currentSong.artist}</p>
              </div>

              {/* Progress Bar */}
              <div className="w-full max-w-2xl mb-4">
                <div className="relative h-2 bg-white/10 rounded-full cursor-pointer group" onClick={handleSeek}>
                  <div 
                    className="absolute h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all"
                    style={{ width: `${(currentTime / duration) * 100}%` }}
                  />
                  <div 
                    className="absolute w-4 h-4 bg-white rounded-full top-1/2 -translate-y-1/2 shadow-lg"
                    style={{ left: `${(currentTime / duration) * 100}%`, marginLeft: '-8px' }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-sm text-gray-400">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-8 mt-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsShuffle(!isShuffle);
                  }}
                  className={`p-3 rounded-full transition-colors ${
                    isShuffle ? 'text-green-500 bg-green-500/20' : 'text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Shuffle size={24} />
                </button>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    playPrevious();
                  }}
                  className="p-3 text-white hover:bg-white/10 rounded-full transition-colors"
                >
                  <SkipBack size={32} />
                </button>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePlayPause();
                  }}
                  className="p-6 bg-white hover:bg-gray-200 rounded-full transition-all transform hover:scale-110 shadow-2xl"
                >
                  {isPlaying ? (
                    <Pause size={32} className="text-black" />
                  ) : (
                    <Play size={32} className="text-black ml-1" />
                  )}
                </button>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    playNext();
                  }}
                  className="p-3 text-white hover:bg-white/10 rounded-full transition-colors"
                >
                  <SkipForward size={32} />
                </button>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsRepeat(!isRepeat);
                  }}
                  className={`p-3 rounded-full transition-colors ${
                    isRepeat ? 'text-green-500 bg-green-500/20' : 'text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Repeat size={24} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Queue Sidebar */}
      <AnimatePresence>
        {showQueue && (
          <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            className="fixed right-0 top-0 bottom-0 w-80 bg-[#1a1a1a] border-l border-white/10 z-40 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between sticky top-0 bg-[#1a1a1a]">
              <h3 className="font-semibold text-lg">Queue</h3>
              <button
                onClick={() => setShowQueue(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 space-y-2">
              {queue.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <List size={48} className="mx-auto mb-4 opacity-50" />
                  <p>No songs in queue</p>
                </div>
              ) : (
                queue.map((song, index) => (
                  <div
                    key={`queue-${song.id}-${index}`}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      index === currentQueueIndex
                        ? 'bg-green-500/20 border border-green-500/50'
                        : 'bg-[#2c2c2e] hover:bg-[#323234]'
                    }`}
                    onClick={() => {
                      setCurrentQueueIndex(index);
                      setCurrentSong(song);
                      if (audioRef.current && song.convertedAudioUrl) {
                        audioRef.current.src = song.convertedAudioUrl;
                        audioRef.current.load();
                        audioRef.current.play();
                      }
                    }}
                  >
                    <div className="flex items-center gap-3">
                      {song.thumbnail && (
                        <img 
                          src={song.thumbnail} 
                          alt={song.title}
                          className="w-12 h-12 rounded object-cover"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium truncate">{song.title}</h4>
                        <p className="text-xs text-gray-400 truncate">{song.artist}</p>
                      </div>
                      {index === currentQueueIndex && isPlaying && (
                        <div className="flex gap-0.5">
                          <div className="w-0.5 h-3 bg-green-500 animate-pulse"></div>
                          <div className="w-0.5 h-3 bg-green-500 animate-pulse" style={{animationDelay: '150ms'}}></div>
                          <div className="w-0.5 h-3 bg-green-500 animate-pulse" style={{animationDelay: '300ms'}}></div>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Navigation */}
      <div className={`flex border-t border-white/10 ${currentSong ? 'hidden' : ''}`}>
        <button
          onClick={() => setTab("download")}
          className={`flex-1 py-3 flex flex-col items-center text-sm transition-colors ${
            tab === "download" ? "text-blue-400" : "text-gray-400 hover:text-gray-300"
          }`}
        >
          <Download size={18} />
          Download
        </button>
        <button
          onClick={() => setTab("playlist")}
          className={`flex-1 py-3 flex flex-col items-center text-sm transition-colors ${
            tab === "playlist" ? "text-blue-400" : "text-gray-400 hover:text-gray-300"
          }`}
        >
          <Music size={18} />
          Playlists
        </button>
      </div>
      
      {/* Playlist Selector Modal */}
      <AnimatePresence>
        {showPlaylistSelector && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowPlaylistSelector(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#2c2c2e] rounded-lg p-6 w-80 max-w-sm mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-4">Add to Playlist</h3>
              <p className="text-sm text-gray-400 mb-4">
                Song will be converted to <span className="text-purple-400 font-semibold">432Hz tuning</span> and added to your playlist
              </p>
              
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {playlists.map(playlist => (
                  <div
                    key={playlist.id}
                    className={`p-3 rounded cursor-pointer transition-colors ${
                      selectedPlaylistForAdd === playlist.id 
                        ? 'bg-purple-500/20 border border-purple-500' 
                        : 'bg-[#3c3c3e] hover:bg-[#4c4c4e]'
                    }`}
                    onClick={() => setSelectedPlaylistForAdd(playlist.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded flex items-center justify-center">
                        <Music size={14} className="text-white" />
                      </div>
                      <div>
                        <p className="font-medium">{playlist.name}</p>
                        <p className="text-xs text-gray-400">{playlist.songs?.length || 0} songs</p>
                      </div>
                    </div>
                  </div>
                ))}
                
                {playlists.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <Music size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No playlists yet</p>
                    <p className="text-xs mt-1">Create your first playlist!</p>
                    <button
                      onClick={() => {
                        setShowPlaylistSelector(false);
                        setTab('playlist');
                        setShowAddPlaylist(true);
                      }}
                      className="mt-4 px-4 py-2 bg-purple-500 hover:bg-purple-600 rounded-md text-sm transition-colors"
                    >
                      Create Playlist
                    </button>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowPlaylistSelector(false);
                    setSelectedPlaylistForAdd(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!selectedPlaylistForAdd) {
                      alert('Please select a playlist!');
                      return;
                    }
                    setShowPlaylistSelector(false);
                    await processYouTubeUrl('add-to-playlist', selectedPlaylistForAdd);
                    setSelectedPlaylistForAdd(null);
                  }}
                  className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-600 rounded-md transition-colors"
                  disabled={!selectedPlaylistForAdd}
                >
                  Add Song
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}