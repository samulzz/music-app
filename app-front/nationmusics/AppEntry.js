import TrackPlayer from 'react-native-track-player';

TrackPlayer.registerPlaybackService(() => {
	const playbackServiceModule = require('./services/playbackService.js');
	return playbackServiceModule?.default ?? playbackServiceModule;
});

require('expo-router/entry');