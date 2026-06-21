package me.samulsz.musicapi.services;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import jakarta.annotation.PreDestroy;

@Service
public class MusicService {

    private static final String AUDIUS_PREFIX = "audius-";
    private static final String AUDIUS_APP_NAME = "NationMusics";
    private static final String DEEZER_PREFIX = "deezer-";

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final Map<String, Object> downloadLocks = new ConcurrentHashMap<>();
    private final Map<String, String> preparationStatus = new ConcurrentHashMap<>();
    private final Map<String, String> preparationErrors = new ConcurrentHashMap<>();
    private final ExecutorService preparationExecutor = Executors.newSingleThreadExecutor();

    public MusicService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NORMAL)
                .connectTimeout(Duration.ofSeconds(15))
                .build();
    }

    @Value("${tools.yt-dlp-path}")
    private String ytDlpPath;

    @Value("${tools.ffmpeg-path}")
    private String ffmpegPath;

    @Value("${tools.youtube-cookies-path:}")
    private String youtubeCookiesPath;

    private File addCookiesIfConfigured(List<String> command) {
        if (youtubeCookiesPath != null && !youtubeCookiesPath.isBlank()) {
            File cookies = new File(youtubeCookiesPath);
            if (cookies.isFile() && cookies.canRead()) {
                try {
                    File temporaryCookies = File.createTempFile("nationmusics-youtube-", ".txt");
                    Files.copy(cookies.toPath(), temporaryCookies.toPath(), StandardCopyOption.REPLACE_EXISTING);
                    temporaryCookies.setReadable(false, false);
                    temporaryCookies.setReadable(true, true);
                    temporaryCookies.setWritable(false, false);
                    temporaryCookies.setWritable(true, true);
                    command.add("--cookies");
                    command.add(temporaryCookies.getAbsolutePath());
                    return temporaryCookies;
                } catch (Exception e) {
                    System.err.println("Não foi possível preparar os cookies do YouTube: " + e.getMessage());
                }
            }
        }
        return null;
    }

    private void deleteTemporaryCookies(File temporaryCookies) {
        if (temporaryCookies != null && temporaryCookies.exists() && !temporaryCookies.delete()) {
            temporaryCookies.deleteOnExit();
        }
    }

    public List<Map<String, String>> buscarNoYouTube(String query) {
        List<Map<String, String>> resultados = new ArrayList<>();
        File temporaryCookies = null;
        
        try {
            List<String> command = new ArrayList<>();
            command.add(ytDlpPath);
            temporaryCookies = addCookiesIfConfigured(command);
            command.add("ytsearch5:" + query);
            command.add("--flat-playlist");
            command.add("--print");
            command.add("%(id)s|%(title)s|%(uploader)s|%(thumbnail)s");
            ProcessBuilder builder = new ProcessBuilder(command);

            builder.redirectErrorStream(true);
            Process process = builder.start();

            BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
            String linha;

            while ((linha = reader.readLine()) != null) {
                String[] partes = linha.split("\\|", 4);

                if (partes.length >= 4) {
                    String videoId = partes[0].trim();
                    if (!videoId.matches("[A-Za-z0-9_-]{11}")) {
                        continue;
                    }

                    String thumbnail = partes[3].trim();
                    if (thumbnail.isBlank()
                            || thumbnail.equalsIgnoreCase("NA")
                            || thumbnail.equalsIgnoreCase("none")
                            || !thumbnail.startsWith("http")) {
                        thumbnail = "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg";
                    }

                    resultados.add(Map.of(
                            "id", videoId,
                            "titulo", partes[1],
                            "artista", partes[2],
                            "capa", thumbnail
                    ));
                }
            }
            process.waitFor();
        } catch (Exception e) {
            System.err.println("Erro ao buscar música: " + e.getMessage());
        } finally {
            deleteTemporaryCookies(temporaryCookies);
        }

        if (resultados.isEmpty()) {
            resultados.addAll(buscarNaDeezer(query));
        }
        if (resultados.isEmpty()) {
            resultados.addAll(buscarNaAudius(query));
        }
        return resultados;
    }

    private List<Map<String, String>> buscarNaDeezer(String query) {
        List<Map<String, String>> resultados = new ArrayList<>();
        try {
            String encodedQuery = URLEncoder.encode(query, StandardCharsets.UTF_8);
            URI uri = URI.create("https://api.deezer.com/search?q=" + encodedQuery + "&limit=5");
            HttpRequest request = HttpRequest.newBuilder(uri)
                    .timeout(Duration.ofSeconds(20))
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(
                    request,
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)
            );
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                return resultados;
            }

            JsonNode tracks = objectMapper.readTree(response.body()).path("data");
            if (!tracks.isArray()) {
                return resultados;
            }
            for (JsonNode track : tracks) {
                String id = track.path("id").asText();
                String title = track.path("title").asText("Música");
                String artist = track.path("artist").path("name").asText("Deezer");
                String cover = track.path("album").path("cover_medium").asText("");
                String preview = track.path("preview").asText("");
                if (!id.isBlank() && !preview.isBlank()) {
                    resultados.add(Map.of(
                            "id", DEEZER_PREFIX + id,
                            "titulo", title,
                            "artista", artist,
                            "capa", cover
                    ));
                }
            }
        } catch (Exception e) {
            System.err.println("Erro ao buscar na Deezer: " + e.getMessage());
        }
        return resultados;
    }

    private List<Map<String, String>> buscarNaAudius(String query) {
        List<Map<String, String>> resultados = new ArrayList<>();
        try {
            String encodedQuery = URLEncoder.encode(query, StandardCharsets.UTF_8);
            URI uri = URI.create("https://api.audius.co/v1/tracks/search?query="
                    + encodedQuery + "&app_name=" + AUDIUS_APP_NAME);
            HttpRequest request = HttpRequest.newBuilder(uri)
                    .timeout(Duration.ofSeconds(20))
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(
                    request,
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)
            );

            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                return resultados;
            }

            JsonNode tracks = objectMapper.readTree(response.body()).path("data");
            if (!tracks.isArray()) {
                return resultados;
            }

            for (JsonNode track : tracks) {
                String id = track.path("id").asText();
                String title = track.path("title").asText("Música");
                String artist = track.path("user").path("name").asText("Audius");
                String cover = track.path("artwork").path("_480x480").asText("");
                if (!id.isBlank()) {
                    resultados.add(Map.of(
                            "id", AUDIUS_PREFIX + id,
                            "titulo", title,
                            "artista", artist,
                            "capa", cover
                    ));
                }
                if (resultados.size() == 5) {
                    break;
                }
            }
        } catch (Exception e) {
            System.err.println("Erro ao buscar na Audius: " + e.getMessage());
        }
        return resultados;
    }

    public File baixarAudio(String videoId) {
        Object lock = downloadLocks.computeIfAbsent(videoId, ignored -> new Object());
        try {
            synchronized (lock) {
                return baixarAudioInterno(videoId);
            }
        } finally {
            downloadLocks.remove(videoId, lock);
        }
    }

    public Map<String, String> prepararAudio(String videoId) {
        File cached = findCachedAudio(videoId);
        if (cached != null) {
            preparationStatus.put(videoId, "ready");
            return Map.of("status", "ready");
        }

        String current = preparationStatus.get(videoId);
        if ("preparing".equals(current)) {
            return Map.of("status", "preparing");
        }

        preparationStatus.put(videoId, "preparing");
        preparationErrors.remove(videoId);
        preparationExecutor.submit(() -> {
            try {
                File audio = baixarAudio(videoId);
                if (audio != null && audio.exists() && audio.length() > 0) {
                    preparationStatus.put(videoId, "ready");
                } else {
                    preparationErrors.put(videoId, "Não foi possível preparar esta música.");
                    preparationStatus.put(videoId, "error");
                }
            } catch (Exception e) {
                preparationErrors.put(videoId, "Falha ao preparar a música.");
                preparationStatus.put(videoId, "error");
            }
        });
        return Map.of("status", "preparing");
    }

    public Map<String, String> statusAudio(String videoId) {
        File cached = findCachedAudio(videoId);
        if (cached != null) {
            preparationStatus.put(videoId, "ready");
            return Map.of("status", "ready");
        }

        String status = preparationStatus.getOrDefault(videoId, "not_started");
        if ("error".equals(status)) {
            return Map.of(
                    "status", "error",
                    "message", preparationErrors.getOrDefault(videoId, "Não foi possível preparar esta música.")
            );
        }
        return Map.of("status", status);
    }

    private File findCachedAudio(String videoId) {
        if (videoId == null || videoId.isBlank()) return null;
        String fileName;
        if (videoId.startsWith(DEEZER_PREFIX) || videoId.startsWith(AUDIUS_PREFIX)) {
            fileName = videoId + ".mp3";
        } else {
            fileName = videoId + ".mp3";
        }
        File file = new File("downloads/", fileName);
        return file.isFile() && file.length() > 0 ? file : null;
    }

    @PreDestroy
    public void shutdownPreparationExecutor() {
        preparationExecutor.shutdownNow();
    }

    private File baixarAudioInterno(String videoId) {
        if (videoId != null && videoId.startsWith(DEEZER_PREFIX)) {
            return baixarPreviaDaDeezer(videoId.substring(DEEZER_PREFIX.length()));
        }
        if (videoId != null && videoId.startsWith(AUDIUS_PREFIX)) {
            return baixarAudioDaAudius(videoId.substring(AUDIUS_PREFIX.length()));
        }

        String url = "https://www.youtube.com/watch?v=" + videoId;
        String diretorioSaida = "downloads/";
        String arquivoSaida = diretorioSaida + videoId + ".mp3";

        File pasta = new File(diretorioSaida);
        if (!pasta.exists()) {
            pasta.mkdirs();
        }

        File arquivoMp3 = new File(arquivoSaida);

        if (arquivoMp3.exists()) {
            System.out.println("Música já existe no servidor. Puxando do cache...");
            return arquivoMp3;
        }

        File temporaryCookies = null;
        try {
            System.out.println("Iniciando download e conversão para MP3...");
            List<String> command = new ArrayList<>();
            command.add(ytDlpPath);
            temporaryCookies = addCookiesIfConfigured(command);
            command.add("-x");
            command.add("--no-playlist");
            command.add("--concurrent-fragments");
            command.add("4");
            command.add("--socket-timeout");
            command.add("20");
            command.add("--retries");
            command.add("3");
            command.add("--audio-format");
            command.add("mp3");
            command.add("--ffmpeg-location");
            command.add(ffmpegPath);
            command.add("-o");
            command.add(diretorioSaida + "%(id)s.%(ext)s");
            command.add(url);
            ProcessBuilder builder = new ProcessBuilder(command);

            builder.redirectErrorStream(true);
            Process process = builder.start();

            BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
            while (reader.readLine() != null) {}

            process.waitFor();

            if (arquivoMp3.exists()) {
                System.out.println("Download concluído com sucesso!");
                return arquivoMp3;
            }
        } catch (Exception e) {
            System.err.println("Erro crítico ao baixar áudio: " + e.getMessage());
        } finally {
            deleteTemporaryCookies(temporaryCookies);
        }

        return null;
    }

    private File baixarPreviaDaDeezer(String trackId) {
        if (!trackId.matches("\\d+")) {
            return null;
        }

        File pasta = new File("downloads/");
        if (!pasta.exists() && !pasta.mkdirs()) {
            return null;
        }
        File arquivoMp3 = new File(pasta, DEEZER_PREFIX + trackId + ".mp3");
        if (arquivoMp3.exists() && arquivoMp3.length() > 0) {
            return arquivoMp3;
        }

        try {
            HttpRequest metadataRequest = HttpRequest.newBuilder(
                            URI.create("https://api.deezer.com/track/" + trackId))
                    .timeout(Duration.ofSeconds(20))
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> metadataResponse = httpClient.send(
                    metadataRequest,
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)
            );
            String previewUrl = objectMapper.readTree(metadataResponse.body()).path("preview").asText("");
            if (previewUrl.isBlank()) {
                return null;
            }

            HttpRequest audioRequest = HttpRequest.newBuilder(URI.create(previewUrl))
                    .timeout(Duration.ofMinutes(2))
                    .header("Accept", "audio/mpeg,audio/*")
                    .GET()
                    .build();
            HttpResponse<java.nio.file.Path> audioResponse = httpClient.send(
                    audioRequest,
                    HttpResponse.BodyHandlers.ofFile(arquivoMp3.toPath())
            );
            if (audioResponse.statusCode() >= 200 && audioResponse.statusCode() < 300
                    && arquivoMp3.exists() && arquivoMp3.length() > 0) {
                return arquivoMp3;
            }
        } catch (Exception e) {
            System.err.println("Erro ao baixar prévia da Deezer: " + e.getMessage());
        }

        if (arquivoMp3.exists()) {
            arquivoMp3.delete();
        }
        return null;
    }

    private File baixarAudioDaAudius(String trackId) {
        if (!trackId.matches("[A-Za-z0-9]+")) {
            return null;
        }

        File pasta = new File("downloads/");
        if (!pasta.exists() && !pasta.mkdirs()) {
            return null;
        }

        File arquivoMp3 = new File(pasta, AUDIUS_PREFIX + trackId + ".mp3");
        if (arquivoMp3.exists() && arquivoMp3.length() > 0) {
            return arquivoMp3;
        }

        try {
            URI uri = URI.create("https://api.audius.co/v1/tracks/" + trackId
                    + "/stream?app_name=" + AUDIUS_APP_NAME);
            HttpRequest request = HttpRequest.newBuilder(uri)
                    .timeout(Duration.ofMinutes(3))
                    .header("Accept", "audio/mpeg,audio/*")
                    .GET()
                    .build();
            HttpResponse<java.nio.file.Path> response = httpClient.send(
                    request,
                    HttpResponse.BodyHandlers.ofFile(arquivoMp3.toPath())
            );
            if (response.statusCode() >= 200 && response.statusCode() < 300
                    && arquivoMp3.exists() && arquivoMp3.length() > 0) {
                return arquivoMp3;
            }
        } catch (Exception e) {
            System.err.println("Erro ao baixar áudio da Audius: " + e.getMessage());
        }

        if (arquivoMp3.exists()) {
            arquivoMp3.delete();
        }
        return null;
    }
}
