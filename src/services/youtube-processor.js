// src/services/youtube-processor.js
import { PinealonBackend } from '../backend-services.js';

export class YouTubeProcessor {
  constructor(userId) {
    this.userId = userId;
    this.backend = new PinealonBackend(userId);
    this.apiEndpoint = 'http://localhost:3001/api'; // Your backend API
  }

  // Extract YouTube video ID from various URL formats
  extractVideoId(url) {
    const patterns = [
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/,
      /^[a-zA-Z0-9_-]{11}$/ // Direct video ID
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  // Get video metadata from YouTube
  async getVideoMetadata(videoId) {
    try {
      const response = await fetch(`${this.apiEndpoint}/youtube/metadata`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ videoId })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching metadata:', error);
      throw new Error('Failed to fetch video metadata');
    }
  }

  // Download and convert audio with 432Hz tuning
  async downloadAndConvert(videoId, options = {}) {
    try {
      const {
        convertTo432Hz = true,
        format = 'mp3',
        quality = '192k'
      } = options;

      console.log(`Processing video ${videoId} with 432Hz conversion: ${convertTo432Hz}`);

      const response = await fetch(`${this.apiEndpoint}/youtube/convert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoId,
          convertTo432Hz,
          format,
          quality,
          userId: this.userId
        })
      });

      if (!response.ok) {
        throw new Error(`Conversion failed! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error during conversion:', error);
      throw new Error(error.message || 'Failed to convert audio');
    }
  }

  // Main processing function
  async processYouTubeUrl(url, action = 'download', playlistId = null) {
    try {
      console.log('='.repeat(60));
      console.log(`Processing YouTube URL: ${url}`);
      console.log(`Action: ${action}, Playlist: ${playlistId}`);
      console.log('='.repeat(60));

      // Extract video ID
      const videoId = this.extractVideoId(url);
      if (!videoId) {
        throw new Error('Invalid YouTube URL or video ID');
      }
      console.log('Video ID:', videoId);

      // Get video metadata
      console.log('Fetching video metadata...');
      const metadata = await this.getVideoMetadata(videoId);
      
      if (!metadata) {
        throw new Error('Could not fetch video information');
      }
      console.log('Metadata received:', metadata.title);

      // Create song data object
      const songData = {
        title: metadata.title || `Unknown Title (${videoId})`,
        artist: metadata.uploader || metadata.channel || 'Unknown Artist',
        duration: this.formatDuration(metadata.duration),
        youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnail: metadata.thumbnail || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        videoId: videoId,
        originalAudioUrl: `https://www.youtube.com/watch?v=${videoId}`,
        isConverted: false,
        convertedAudioUrl: null,
        addedAt: new Date()
      };

      if (action === 'download') {
        // Convert and download
        console.log('Starting audio conversion for download...');
        const conversionResult = await this.downloadAndConvert(videoId, {
          convertTo432Hz: true,
          format: 'mp3',
          quality: '192k'
        });

        console.log('Conversion complete!');
        console.log('Download URL:', conversionResult.downloadUrl);

        songData.convertedAudioUrl = conversionResult.downloadUrl;
        songData.isConverted = true;
        songData.conversionDetails = conversionResult;

        return {
          success: true,
          action: 'download',
          songData,
          downloadUrl: conversionResult.downloadUrl,
          message: 'Audio converted to 432Hz and ready for download!'
        };

      } else if (action === 'add-to-playlist' && playlistId) {
        console.log('Adding to playlist:', playlistId);
        console.log('Starting audio conversion...');
        
        // Convert audio
        const conversionResult = await this.downloadAndConvert(videoId, {
          convertTo432Hz: true,
          format: 'mp3',
          quality: '192k'
        });

        console.log('Conversion result:', conversionResult);

        // Build complete audio URL from local backend
        const audioUrl = conversionResult.fileUrl || conversionResult.downloadUrl || '';
        const fullAudioUrl = audioUrl.startsWith('http') 
          ? audioUrl 
          : `http://localhost:3001${audioUrl}`;

        console.log('Full audio URL:', fullAudioUrl);

        // Update song data with all necessary fields
        songData.convertedAudioUrl = fullAudioUrl;
        songData.isConverted = true;
        songData.conversionMethod = conversionResult.conversion || 'dynamic';
        songData.fileSize = conversionResult.fileSize || 0;
        songData.localFilePath = conversionResult.fileUrl || '';

        console.log('Final song data to be saved:');
        console.log(JSON.stringify(songData, null, 2));

        // Add to Firestore playlist
        console.log('Adding song to Firestore playlist...');
        const addedSong = await this.backend.addSongToPlaylist(playlistId, songData);

        console.log('SUCCESS! Song added to playlist:');
        console.log('- Title:', addedSong.title);
        console.log('- Artist:', addedSong.artist);
        console.log('- Duration:', addedSong.duration);
        console.log('- Audio URL:', addedSong.convertedAudioUrl);
        console.log('='.repeat(60));

        return {
          success: true,
          action: 'add-to-playlist',
          songData: addedSong,
          playlistId,
          audioUrl: fullAudioUrl,
          message: `"${songData.title}" converted to 432Hz and added to playlist!`
        };

      } else if (action === 'metadata-only') {
        // Just return metadata without conversion
        return {
          success: true,
          action: 'metadata-only',
          songData,
          message: 'Video metadata retrieved successfully!'
        };
      }

    } catch (error) {
      console.error('='.repeat(60));
      console.error('ERROR in YouTube processing:');
      console.error('Error message:', error.message);
      console.error('Full error:', error);
      console.error('='.repeat(60));
      
      return {
        success: false,
        error: error.message,
        message: `Processing failed: ${error.message}`
      };
    }
  }

  // Helper: Format duration from seconds to MM:SS
  formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  // Get user's processing history
  async getProcessingHistory() {
    try {
      const response = await fetch(`${this.apiEndpoint}/user/${this.userId}/history`);
      if (!response.ok) throw new Error('Failed to fetch history');
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching history:', error);
      return [];
    }
  }

  // Check processing status
  async checkProcessingStatus(jobId) {
    try {
      const response = await fetch(`${this.apiEndpoint}/status/${jobId}`);
      if (!response.ok) throw new Error('Failed to check status');
      
      return await response.json();
    } catch (error) {
      console.error('Error checking status:', error);
      return { status: 'error', message: 'Could not check status' };
    }
  }
}