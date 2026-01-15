// src/backend-services.js
import { db } from './firebase.js';
import { 
  collection, 
  doc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  arrayUnion,
  arrayRemove,
  getDoc,
  setDoc
} from 'firebase/firestore';

export class PinealonBackend {
  constructor(userId) {
    this.userId = userId;
    console.log("🔧 Backend initialized for user:", userId);
  }

  // FIXED: GET ALL PLAYLISTS FOR CURRENT USER
  async getUserPlaylists() {
    try {
      console.log("🔍 FETCHING playlists for user:", this.userId);
      
      if (!this.userId) {
        console.log("❌ No user ID provided");
        return [];
      }

      // First, let's check if the collection exists at all
      const allPlaylistsSnapshot = await getDocs(collection(db, 'playlists'));
      console.log("📊 Total playlists in database:", allPlaylistsSnapshot.size);
      
      // Debug: Show all playlists and their userIds
      allPlaylistsSnapshot.forEach((doc) => {
        const data = doc.data();
        console.log("📄 Playlist:", doc.id, "- User:", data.userId, "- Name:", data.name);
      });

      // Now try the filtered query
      const q = query(
        collection(db, 'playlists'),
        where('userId', '==', this.userId)
      );
      
      console.log("🔍 Running query for userId:", this.userId);
      const querySnapshot = await getDocs(q);
      
      console.log("📋 Query returned:", querySnapshot.size, "playlists");
      
      const playlists = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        console.log("✅ Found playlist:", doc.id, data.name);
        playlists.push({
          id: doc.id,
          ...data
        });
      });
      
      console.log("🎯 Final playlists array:", playlists);
      return playlists;
      
    } catch (error) {
      console.error('❌ Error getting playlists:', error);
      console.error('Error details:', error.code, error.message);
      return [];
    }
  }

  // FIXED: CREATE NEW PLAYLIST
  async createPlaylist(name) {
    try {
      console.log("🎵 Creating playlist:", name, "for user:", this.userId);
      
      if (!this.userId) {
        throw new Error('No user ID available');
      }
      
      const playlistData = {
        name: name,
        userId: this.userId, // Make sure this matches exactly
        songs: [],
        createdAt: new Date(),
        isFavorite: false,
        lastPlayed: null
      };
      
      console.log("💾 Saving playlist data:", playlistData);
      
      const docRef = await addDoc(collection(db, 'playlists'), playlistData);
      console.log("✅ Playlist created with ID:", docRef.id);
      
      // Verify it was saved correctly
      const savedDoc = await getDoc(docRef);
      if (savedDoc.exists()) {
        console.log("✅ Verified saved data:", savedDoc.data());
      }
      
      return { 
        id: docRef.id, 
        ...playlistData 
      };
      
    } catch (error) {
      console.error('❌ Error creating playlist:', error);
      throw new Error('Failed to create playlist: ' + error.message);
    }
  }

  // UPDATE PLAYLIST (generic update)
  async updatePlaylist(playlistId, updates) {
    try {
      console.log("✏️ Updating playlist:", playlistId, "with:", updates);
      
      const playlistRef = doc(db, 'playlists', playlistId);
      await updateDoc(playlistRef, updates);
      
      console.log("✅ Playlist updated successfully");
      
    } catch (error) {
      console.error('❌ Error updating playlist:', error);
      throw new Error('Failed to update playlist: ' + error.message);
    }
  }

  // DELETE PLAYLIST
  async deletePlaylist(playlistId) {
    try {
      console.log("🗑️ Deleting playlist:", playlistId);
      
      await deleteDoc(doc(db, 'playlists', playlistId));
      console.log("✅ Playlist deleted successfully");
      
    } catch (error) {
      console.error('❌ Error deleting playlist:', error);
      throw new Error('Failed to delete playlist: ' + error.message);
    }
  }

  // ADD SONG TO PLAYLIST
  async addSongToPlaylist(playlistId, songData) {
    try {
      console.log("🎶 Adding song to playlist:", playlistId);
      
      const song = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        title: songData.title || 'Unknown Title',
        artist: songData.artist || 'Unknown Artist',
        duration: songData.duration || '0:00',
        youtubeUrl: songData.youtubeUrl || '',
        convertedAudioUrl: songData.convertedAudioUrl || '',
        originalAudioUrl: songData.originalAudioUrl || '',
        createdAt: new Date(),
        isConverted: songData.isConverted || false,
        thumbnail: songData.thumbnail || '',
        addedAt: songData.addedAt || new Date()
      };

      const playlistRef = doc(db, 'playlists', playlistId);
      await updateDoc(playlistRef, {
        songs: arrayUnion(song),
        lastPlayed: new Date()
      });

      console.log("✅ Song added to playlist:", song.title);
      return song;
      
    } catch (error) {
      console.error('❌ Error adding song to playlist:', error);
      throw new Error('Failed to add song: ' + error.message);
    }
  }

  // REMOVE SONG FROM PLAYLIST
  async removeSongFromPlaylist(playlistId, songId) {
    try {
      console.log("➖ Removing song from playlist:", playlistId, "song:", songId);
      
      const playlistRef = doc(db, 'playlists', playlistId);
      const playlistDoc = await getDoc(playlistRef);
      
      if (!playlistDoc.exists()) {
        throw new Error('Playlist not found');
      }
      
      const currentSongs = playlistDoc.data().songs || [];
      const updatedSongs = currentSongs.filter(song => song.id !== songId);
      
      await updateDoc(playlistRef, { songs: updatedSongs });
      console.log("✅ Song removed from playlist");
      
    } catch (error) {
      console.error('❌ Error removing song from playlist:', error);
      throw new Error('Failed to remove song: ' + error.message);
    }
  }

  // ADD SONG TO FAVORITES
  async addSongToFavorites(songData) {
    try {
      console.log("⭐ Adding song to favorites:", songData.title);
      
      const userRef = doc(db, 'users', this.userId);
      const userDoc = await getDoc(userRef);
      
      const favoriteSong = {
        id: songData.id,
        title: songData.title,
        artist: songData.artist,
        duration: songData.duration,
        youtubeUrl: songData.youtubeUrl,
        convertedAudioUrl: songData.convertedAudioUrl,
        originalAudioUrl: songData.originalAudioUrl,
        favoritedAt: new Date(),
        playlistId: songData.playlistId || ''
      };

      if (!userDoc.exists()) {
        await setDoc(userRef, { 
          userId: this.userId, 
          favoriteSongs: [favoriteSong],
          createdAt: new Date()
        });
      } else {
        await updateDoc(userRef, {
          favoriteSongs: arrayUnion(favoriteSong)
        });
      }
      
      console.log("✅ Song added to favorites");
      
    } catch (error) {
      console.error('❌ Error adding song to favorites:', error);
      throw new Error('Failed to add song to favorites: ' + error.message);
    }
  }

  // REMOVE SONG FROM FAVORITES
  async removeSongFromFavorites(songId) {
    try {
      console.log("➖ Removing song from favorites:", songId);
      
      const userRef = doc(db, 'users', this.userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        throw new Error('User favorites not found');
      }
      
      const currentFavorites = userDoc.data().favoriteSongs || [];
      const updatedFavorites = currentFavorites.filter(song => song.id !== songId);
      
      await updateDoc(userRef, { favoriteSongs: updatedFavorites });
      console.log("✅ Song removed from favorites");
      
    } catch (error) {
      console.error('❌ Error removing song from favorites:', error);
      throw new Error('Failed to remove song from favorites: ' + error.message);
    }
  }

  // GET USER'S FAVORITE SONGS
  async getFavoriteSongs() {
    try {
      console.log("🌟 Getting favorite songs for user:", this.userId);
      
      const userDoc = await getDoc(doc(db, 'users', this.userId));
      if (!userDoc.exists()) {
        console.log("ℹ️ No favorite songs found");
        return [];
      }
      
      const favoriteSongs = userDoc.data().favoriteSongs || [];
      console.log("✅ Found favorite songs:", favoriteSongs.length);
      return favoriteSongs;
      
    } catch (error) {
      console.error('❌ Error getting favorite songs:', error);
      return [];
    }
  }

  // SIMPLE DEBUG METHOD
  async debugUserData() {
    console.log("🔧 DEBUG: Current user ID:", this.userId);
    
    try {
      // Get all playlists in the database
      const allPlaylists = await getDocs(collection(db, 'playlists'));
      console.log("🔧 DEBUG: Total playlists in DB:", allPlaylists.size);
      
      allPlaylists.forEach(doc => {
        const data = doc.data();
        console.log(`🔧 DEBUG: Playlist ${doc.id} - userId: "${data.userId}" - name: "${data.name}"`);
        console.log(`🔧 DEBUG: Does "${data.userId}" === "${this.userId}"?`, data.userId === this.userId);
      });
      
      // Try the user query
      const userPlaylists = await this.getUserPlaylists();
      console.log("🔧 DEBUG: User playlists returned:", userPlaylists.length);
      
    } catch (error) {
      console.error("🔧 DEBUG ERROR:", error);
    }
  }
}