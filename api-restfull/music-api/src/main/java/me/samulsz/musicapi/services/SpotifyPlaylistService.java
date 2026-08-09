package me.samulsz.musicapi.services;

import me.samulsz.musicapi.dto.SpotifyPlaylistResponse;
import me.samulsz.musicapi.dto.SpotifyPlaylistTrack;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Value;
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
import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;

@Service
public class SpotifyPlaylistService {

    private static final Pattern SPOTIFY_RESOURCE = Pattern.compile(
            "(?:open\\.spotify\\.com/(?:intl-[a-z]{2}/)?(playlist|album|track)/"
                    + "|spotify:(playlist|album|track):)([A-Za-z0-9]{22})",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern NEXT_DATA = Pattern.compile(
            "<script[^>]+id=[\"']__NEXT_DATA__[\"'][^>]*>(.*?)</script>",
            Pattern.CASE_INSENSITIVE | Pattern.DOTALL
    );
    private static final int MAX_TRACKS = 200;

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    @Value("${tools.spotify-helper-path:}")
    private String spotifyHelperPath;

    public SpotifyPlaylistService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NORMAL)
                .connectTimeout(Duration.ofSeconds(15))
                .build();
    }

    public SpotifyPlaylistResponse preview(String spotifyUrl) {
        SpotifyResource resource = extractResource(spotifyUrl);
        SpotifyPlaylistResponse complete = previewWithHelper(spotifyUrl);
        if (complete != null) {
            return complete;
        }

        String embedUrl = "https://open.spotify.com/embed/" + resource.type() + "/" + resource.id();

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
                throw new IllegalArgumentException("O Spotify não disponibilizou este link.");
            }

            Matcher dataMatcher = NEXT_DATA.matcher(response.body());
            if (!dataMatcher.find()) {
                throw new IllegalArgumentException("Não foi possível ler este conteúdo público.");
            }

            JsonNode entity = objectMapper.readTree(dataMatcher.group(1))
                    .path("props").path("pageProps").path("state").path("data").path("entity");
            String entityType = entity.path("type").asText(resource.type());
            if (!resource.type().equalsIgnoreCase(entityType)) {
                throw new IllegalArgumentException("O Spotify retornou um conteúdo diferente do link informado.");
            }

            JsonNode trackList = entity.path("trackList");
            List<SpotifyPlaylistTrack> tracks = new ArrayList<>();
            if (trackList.isArray()) {
                for (JsonNode track : trackList) {
                    if (tracks.size() == MAX_TRACKS) break;
                    addTrack(tracks, track);
                }
            } else if ("track".equalsIgnoreCase(resource.type())) {
                addTrack(tracks, entity);
            }
            if (tracks.isEmpty()) {
                throw new IllegalArgumentException(
                        "Este conteúdo está vazio, é privado ou não está disponível publicamente."
                );
            }

            int totalTracks = entity.path("trackList").isArray()
                    ? entity.path("trackList").size()
                    : tracks.size();
            String coverUrl = entity.path("coverArt").path("sources").path(0).path("url").asText("");
            return new SpotifyPlaylistResponse(
                    resource.id(),
                    resource.type(),
                    entity.path("name").asText(defaultName(resource.type())),
                    coverUrl,
                    totalTracks,
                    totalTracks > MAX_TRACKS,
                    tracks
            );
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("Não foi possível importar este link agora.");
        }
    }

    private void addTrack(List<SpotifyPlaylistTrack> tracks, JsonNode track) {
        String uri = track.path("uri").asText();
        String id = uri.startsWith("spotify:track:")
                ? uri.substring("spotify:track:".length())
                : track.path("uid").asText(track.path("id").asText(""));
        String title = track.path("title").asText(track.path("name").asText("")).trim();
        String artist = track.path("subtitle").asText("").trim();
        if (artist.isBlank() && track.path("artists").isArray()) {
            List<String> names = new ArrayList<>();
            for (JsonNode artistNode : track.path("artists")) {
                String name = artistNode.path("name").asText("").trim();
                if (!name.isBlank()) names.add(name);
            }
            artist = String.join(", ", names);
        }
        if (!id.isBlank() && !title.isBlank() && !artist.isBlank()) {
            tracks.add(new SpotifyPlaylistTrack(
                    id,
                    title,
                    artist,
                    track.path("duration").asInt(track.path("durationMs").asInt(0))
            ));
        }
    }

    private String defaultName(String type) {
        return switch (type) {
            case "album" -> "Álbum do Spotify";
            case "track" -> "Música do Spotify";
            default -> "Playlist do Spotify";
        };
    }

    private SpotifyPlaylistResponse previewWithHelper(String spotifyUrl) {
        if (spotifyHelperPath == null || spotifyHelperPath.isBlank()) {
            return null;
        }
        File helper = new File(spotifyHelperPath);
        if (!helper.isFile()) {
            return null;
        }

        try {
            Process process = new ProcessBuilder(
                    "python3",
                    helper.getAbsolutePath(),
                    spotifyUrl,
                    String.valueOf(MAX_TRACKS)
            ).redirectErrorStream(true).start();

            StringBuilder output = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    output.append(line);
                }
            }
            int exitCode = process.waitFor();
            JsonNode json = objectMapper.readTree(output.toString());
            if (exitCode != 0 || json.has("error")) {
                throw new IllegalArgumentException("Não foi possível ler todas as faixas deste link.");
            }
            return objectMapper.treeToValue(json, SpotifyPlaylistResponse.class);
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            return null;
        }
    }

    SpotifyResource extractResource(String spotifyUrl) {
        if (spotifyUrl == null || spotifyUrl.isBlank()) {
            throw new IllegalArgumentException("Cole o link de uma música, álbum ou playlist do Spotify.");
        }
        Matcher matcher = SPOTIFY_RESOURCE.matcher(spotifyUrl.trim());
        if (!matcher.find()) {
            throw new IllegalArgumentException("Link do Spotify inválido. Use uma música, álbum ou playlist.");
        }
        String type = matcher.group(1) != null ? matcher.group(1) : matcher.group(2);
        return new SpotifyResource(type.toLowerCase(), matcher.group(3));
    }

    record SpotifyResource(String type, String id) {}
}
