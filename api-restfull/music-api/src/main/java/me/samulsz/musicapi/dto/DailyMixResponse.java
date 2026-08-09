package me.samulsz.musicapi.dto;

import me.samulsz.musicapi.models.Song;

import java.time.LocalDate;
import java.util.List;

public record DailyMixResponse(
        String id,
        String name,
        String description,
        LocalDate generatedFor,
        List<Song> songs
) {}
