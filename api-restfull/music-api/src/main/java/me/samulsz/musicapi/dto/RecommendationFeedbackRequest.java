package me.samulsz.musicapi.dto;

public record RecommendationFeedbackRequest(Long songId, String sourceId, String action) {}
