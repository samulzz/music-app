package me.samulsz.musicapi.models;

import jakarta.persistence.*;

/** Latest review is durable; warnings are evidence, never permission to delete audio. */
@Entity
@Table(name = "audio_quality_reviews", indexes = @Index(name = "idx_audio_review_checked", columnList = "checked_at"))
public class AudioQualityReview {
    @Id public Long songId;
    public String sourceId;
    public String title;
    public String artist;
    public String state = "PENDING";
    @Column(length = 1000) public String issue = "OK";
    @Column(length = 2000) public String details = "";
    public double confidence;
    public long bytes;
    public long fileModified;
    @Column(name = "checked_at") public long checkedAt;
    public Double durationSeconds;
    public Long bitrate;
    public Double integratedLufs;
    public Double truePeakDb;
    public Double silenceRatio;
    @Column(length = 1000) public String sourceTitle;
    public String sourceChannel;
    public String sourceStatus = "NOT_CHECKED";
    // Deliberately not inferred from loudness/silence: singing is not speech.
    public String vocalAssessment = "NOT_ANALYZED";
}
