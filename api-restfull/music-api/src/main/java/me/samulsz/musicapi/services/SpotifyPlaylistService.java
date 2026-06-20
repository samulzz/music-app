package me.samulsz.musicapi.services;

import me.samulsz.musicapi.dto.SpotifyPlaylistResponse;
import me.samulsz.musicapi.dto.SpotifyPlaylistTrack;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class SpotifyPlaylistService {

    private static final Pattern PLAYLIST_ID = Pattern.compile(
            "(?:open\\.spotify\\.com/(?:intl-[a-z]{2}/)?playlist/|spotify:playlist:)([A-Za-z0-9]{22})",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern NEXT_DATA = Pattern.compile(
            "<script[^>]+id=[\"']__NEXT_DATA__[\"'][^>]*>(.*?)</script>",
            Pattern.CASE_INSENSITIVE | Pattern.DOTALL
    );
    private static final int MAX_TRACKS = 200;

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public SpotifyPlaylistService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NORMAL)
                .connectTimeout(Duration.ofSeconds(15))
                .build();
    }

    public SpotifyPlaylistResponse preview(String spotifyUrl) {
        String playlistId = extractPlaylistId(spotifyUrl);
        String embedUrl = "https://open.spotify.com/embed/playlist/" + playlistId;

        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(embedUrl))
                    .timeout(Duration.ofSeconds(25))
                    .header("Accept", "text/html")
                    .header("Accept-Language", "pt-BR,pt;q=0.9,en;q=0.7")
                    .header("User-Agent", "NationMusics/1.0")
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(
                    request,
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)
            );
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalArgumentException("O Spotify não disponibilizou esta playlist.");
            }

            Matcher dataMatcher = NEXT_DATA.matcher(response.body());
            if (!dataMatcher.find()) {
                throw new IllegalArgumentException("Não foi possível ler esta playlist pública.");
            }

            JsonNode entity = objectMapper.readTree(dataMatcher.group(1))
                    .path("props").path("pageProps").path("state").path("data").path("entity");
            if (!"playlist".equalsIgnoreCase(entity.path("type").asText())) {
                throw new IllegalArgumentException("O link informado não é de uma playlist.");
            }

            JsonNode trackList = entity.path("trackList");
            List<SpotifyPlaylistTrack> tracks = new ArrayList<>();
            if (trackList.isArray()) {
                for (JsonNode track : trackList) {
                    if (tracks.size() == MAX_TRACKS) break;
                    String uri = track.path("uri").asText();
                    String id = uri.startsWith("spotify:track:")
                            ? uri.substring("spotify:track:".length())
                            : track.path("uid").asText();
                    String title = track.path("title").asText("").trim();
                    String artist = track.path("subtitle").asText("").trim();
                    if (!title.isBlank() && !artist.isBlank()) {
                        tracks.add(new SpotifyPlaylistTrack(
                                id,
                                title,
                                artist,
                                track.path("duration").asInt(0)
                        ));
                    }
                }
            }
            if (tracks.isEmpty()) {
                throw new IllegalArgumentException(
                        "A playlist está vazia, privada ou não está disponível publicamente."
                );
            }

            int totalTracks = entity.path("trackList").isArray()
                    ? entity.path("trackList").size()
                    : tracks.size();
            String coverUrl = entity.path("coverArt").path("sources").path(0).path("url").asText("");
            return new SpotifyPlaylistResponse(
                    playlistId,
                    entity.path("name").asText("Playlist do Spotify"),
                    coverUrl,
                    totalTracks,
                    totalTracks > MAX_TRACKS,
                    tracks
            );
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("Não foi possível importar a playlist agora.");
        }
    }

    private String extractPlaylistId(String spotifyUrl) {
        if (spotifyUrl == null || spotifyUrl.isBlank()) {
            throw new IllegalArgumentException("Cole o link da playlist do Spotify.");
        }
        Matcher matcher = PLAYLIST_ID.matcher(spotifyUrl.trim());
        if (!matcher.find()) {
            throw new IllegalArgumentException("Link de playlist do Spotify inválido.");
        }
        return matcher.group(1);
    }
}
