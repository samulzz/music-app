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
import java.util.ArrayDeque;
import java.util.Deque;
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
    private static final long YOUTUBE_BLOCK_COOLDOWN_MILLIS = 45 * 60 * 1000L;
    private static final long MIN_YOUTUBE_AUDIO_BYTES = 512 * 1024L;
    private static final double MIN_YOUTUBE_AUDIO_DURATION_SECONDS = 60.0;
    private static final long AUDIO_VALIDATION_CACHE_MILLIS = 30 * 60 * 1000L;

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final Map<String, Object> downloadLocks = new ConcurrentHashMap<>();
    private final Map<String, String> preparationStatus = new ConcurrentHashMap<>();
    private final Map<String, String> preparationErrors = new ConcurrentHashMap<>();
    private final Map<String, AudioValidation> audioValidationCache = new ConcurrentHashMap<>();
    private final ExecutorService preparationExecutor = Executors.newSingleThreadExecutor();
    private final Object youtubeRequestRateLock = new Object();
    private long nextYoutubeRequestAtMillis = 0L;
    private volatile long youtubeBlockedUntilMillis = 0L;

    @Value("${tools.yt-dlp-path}")
    private String ytDlpPath;

    @Value("${tools.ffmpeg-path}")
    private String ffmpegPath;

    @Value("${tools.youtube-pot-provider-url:}")
    private String youtubePotProviderUrl;

    @Value("${tools.youtube-cookies-path:}")
    private String youtubeCookiesPath;

    @Value("${tools.youtube-proxy:}")
    private String youtubeProxy;

    @Value("${tools.youtube-min-request-interval-seconds:10}")
    private long youtubeMinRequestIntervalSeconds;

    public MusicService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NORMAL)
                .connectTimeout(Duration.ofSeconds(15))
                .build();
    }

    private record AudioValidation(long length, long lastModified, long checkedAt, boolean valid) {
        boolean matches(File file, long now) {
            return file.length() == length
                    && file.lastModified() == lastModified
                    && now - checkedAt < AUDIO_VALIDATION_CACHE_MILLIS;
        }
    }

    private boolean isYoutubeTemporarilyBlocked() {
        return System.currentTimeMillis() < youtubeBlockedUntilMillis;
    }

    private void markYoutubeTemporarilyBlocked(String reason) {
        youtubeBlockedUntilMillis = System.currentTimeMillis() + YOUTUBE_BLOCK_COOLDOWN_MILLIS;
        System.err.println("YouTube bloqueado temporariamente para este servidor. Downloads do YouTube pausados por "
                + (YOUTUBE_BLOCK_COOLDOWN_MILLIS / 60_000L)
                + " minutos. Motivo: " + reason);
    }

    private boolean isYoutubeAccessBlockedMessage(String message) {
        String normalized = message == null ? "" : message.toLowerCase();
        return normalized.contains("unusual traffic")
                || normalized.contains("http error 429")
                || normalized.contains("too many requests")
                || normalized.contains("automated queries");
    }

    private String fallbackQuery(String title, String artist) {
        String safeTitle = title == null ? "" : title.trim();
        String safeArtist = artist == null ? "" : artist.trim();
        String query = (safeTitle + " " + safeArtist).trim();
        return query.isBlank() ? safeTitle : query;
    }

    private void addYoutubeAccessOptions(List<String> command) {
        command.add("--extractor-args");
        command.add("youtube:player_client=android_vr;formats=missing_pot");

        if (youtubePotProviderUrl != null && !youtubePotProviderUrl.isBlank()) {
            command.add("--extractor-args");
            command.add("youtubepot-bgutilhttp:base_url=" + youtubePotProviderUrl.trim());
        }

        File cacheDirectory = new File("downloads/.yt-dlp-cache");
        if (!cacheDirectory.exists()) {
            cacheDirectory.mkdirs();
        }
        command.add("--cache-dir");
        command.add(cacheDirectory.getAbsolutePath());
        command.add("--sleep-requests");
        command.add("1");
        command.add("--force-ipv4");

        String configuredProxy = configuredYoutubeProxy();
        if (!configuredProxy.isBlank()) {
            command.add("--proxy");
            command.add(configuredProxy);
            System.out.println("yt-dlp usando proxy configurado para YouTube.");
        }
    }

    private String configuredYoutubeProxy() {
        String fromProperty = youtubeProxy == null ? "" : youtubeProxy.trim();
        if (!fromProperty.isBlank()) {
            return fromProperty;
        }
        String fromEnvironment = System.getenv("YOUTUBE_PROXY");
        return fromEnvironment == null ? "" : fromEnvironment.trim();
    }

    private void waitForYoutubeRequestSlot() throws InterruptedException {
        synchronized (youtubeRequestRateLock) {
            long now = System.currentTimeMillis();
            long waitMillis = Math.max(0L, nextYoutubeRequestAtMillis - now);
            if (waitMillis > 0L) {
                Thread.sleep(waitMillis);
            }

            long intervalMillis = Math.max(0L, youtubeMinRequestIntervalSeconds) * 1_000L;
            nextYoutubeRequestAtMillis = System.currentTimeMillis() + intervalMillis;
        }
    }

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
            if (isYoutubeTemporarilyBlocked()) {
                System.err.println("Busca no YouTube ignorada temporariamente; sem usar fontes curtas alternativas.");
                return List.of();
            }

            List<String> command = new ArrayList<>();
            command.add(ytDlpPath);
            addYoutubeAccessOptions(command);
            temporaryCookies = addCookiesIfConfigured(command);
            command.add("ytsearch5:" + query);
            command.add("--flat-playlist");
            command.add("--print");
            command.add("%(id)s|%(title)s|%(uploader)s|%(thumbnail)s");
            ProcessBuilder builder = new ProcessBuilder(command);

            builder.redirectErrorStream(true);
            waitForYoutubeRequestSlot();
            Process process = builder.start();

            BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
            Deque<String> outputTail = new ArrayDeque<>();
            String linha;

            while ((linha = reader.readLine()) != null) {
                if (outputTail.size() == 20) {
                    outputTail.removeFirst();
                }
                outputTail.addLast(linha);

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
            int exitCode = process.waitFor();
            if (exitCode != 0) {
                String details = String.join(System.lineSeparator(), outputTail);
                if (isYoutubeAccessBlockedMessage(details)) {
                    markYoutubeTemporarilyBlocked(details);
                }
                System.err.println("yt-dlp falhou na busca (código " + exitCode + "): " + details);
            }
        } catch (Exception e) {
            System.err.println("Erro ao buscar música: " + e.getMessage());
            if (isYoutubeAccessBlockedMessage(e.getMessage())) {
                markYoutubeTemporarilyBlocked(e.getMessage());
            }
        } finally {
            deleteTemporaryCookies(temporaryCookies);
        }

        if (resultados.isEmpty()) {
            System.err.println("Nenhum resultado confiável no YouTube para: " + query);
        }
        return resultados;
    }

    private List<Map<String, String>> buscarFontesAlternativas(String query) {
        List<Map<String, String>> resultados = new ArrayList<>();
        resultados.addAll(buscarNaAudius(query));
        if (resultados.size() < 5) {
            resultados.addAll(buscarNaDeezer(query));
        }
        return resultados.stream().limit(5).toList();
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
        return baixarAudio(videoId, "", "");
    }

    public File baixarAudio(String videoId, String title, String artist) {
        Object lock = downloadLocks.computeIfAbsent(videoId, ignored -> new Object());
        try {
            synchronized (lock) {
                return baixarAudioInterno(videoId, title, artist);
            }
        } finally {
            downloadLocks.remove(videoId, lock);
        }
    }

    public Map<String, String> prepararAudio(String videoId) {
        return prepararAudio(videoId, "", "");
    }

    public Map<String, String> prepararAudio(String videoId, String title, String artist) {
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
                File audio = baixarAudio(videoId, title, artist);
                if (audio != null && audio.exists() && audio.length() > 0) {
                    preparationStatus.put(videoId, "ready");
                } else {
                    preparationErrors.put(videoId, "Não foi possível preparar esta música.");
                    preparationStatus.put(videoId, "error");
                }
            } catch (Exception e) {
                preparationErrors.put(videoId, preparationErrorMessage(e));
                preparationStatus.put(videoId, "error");
            }
        });
        return Map.of("status", "preparing");
    }

    private String preparationErrorMessage(Exception error) {
        String message = error.getMessage() == null ? "" : error.getMessage();
        String normalized = message.toLowerCase();
        if (normalized.contains("cookies are no longer valid")
                || normalized.contains("sign in to confirm you")
                || normalized.contains("not a bot")) {
            return "O YouTube recusou temporariamente o acesso do servidor. Tente novamente mais tarde.";
        }
        if (normalized.contains("po token")
                || normalized.contains("pot provider")
                || normalized.contains("bgutil")) {
            return "O gerador de acesso do YouTube está indisponível no servidor.";
        }
        if (normalized.contains("video unavailable")
                || normalized.contains("private video")
                || normalized.contains("has been removed")) {
            return "Esta música não está disponível no YouTube.";
        }
        if (normalized.contains("copyright")) {
            return "Esta música foi bloqueada pelo YouTube.";
        }
        return "Não foi possível preparar esta música.";
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
        File file = cachedAudioFile(videoId);
        if (file == null || !file.isFile() || file.length() <= 0) {
            return null;
        }
        if (!isCachedYoutubeAudioValid(videoId, file)) {
            System.err.println("Cache inválido/removido para " + videoId + ": áudio curto ou incompleto.");
            invalidateAudioValidation(videoId);
            if (!file.delete()) {
                file.deleteOnExit();
            }
            return null;
        }
        return file;
    }

    public boolean hasPrecachedAudio(String videoId) {
        File file = cachedAudioFile(videoId);
        return file != null && file.isFile() && file.length() >= MIN_YOUTUBE_AUDIO_BYTES;
    }

    private File cachedAudioFile(String videoId) {
        if (videoId == null || videoId.isBlank()) return null;
        if (videoId.startsWith(DEEZER_PREFIX) || videoId.startsWith(AUDIUS_PREFIX)) {
            return null;
        }
        return new File("downloads/", videoId + ".mp3");
    }

    @PreDestroy
    public void shutdownPreparationExecutor() {
        preparationExecutor.shutdownNow();
    }

    private File baixarAlternativaParaYoutube(String originalVideoId, String title, String artist) {
        String query = fallbackQuery(title, artist);
        if (query.isBlank()) {
            return null;
        }

        System.err.println("Tentando fallback de áudio para: " + query);
        List<Map<String, String>> alternativas = buscarFontesAlternativas(query);
        for (Map<String, String> alternativa : alternativas) {
            String alternativeId = alternativa.getOrDefault("id", "");
            if (alternativeId.isBlank() || alternativeId.equals(originalVideoId)) {
                continue;
            }
            try {
                File alternativeFile = baixarAudioInterno(alternativeId, "", "");
                if (alternativeFile == null || !alternativeFile.exists() || alternativeFile.length() == 0) {
                    continue;
                }

                File pasta = new File("downloads/");
                if (!pasta.exists()) {
                    pasta.mkdirs();
                }
                File originalCache = new File(pasta, originalVideoId + ".mp3");
                Files.copy(alternativeFile.toPath(), originalCache.toPath(), StandardCopyOption.REPLACE_EXISTING);
                rememberValidAudio(originalVideoId, originalCache);
                System.err.println("Fallback pronto para " + originalVideoId + " usando " + alternativeId);
                return originalCache;
            } catch (Exception fallbackError) {
                System.err.println("Fallback falhou para " + alternativeId + ": " + fallbackError.getMessage());
            }
        }
        return null;
    }

    private File baixarAudioInterno(String videoId, String title, String artist) {
        if (videoId != null && videoId.startsWith(DEEZER_PREFIX)) {
            throw new IllegalStateException("Fonte Deezer removida: ela fornece apenas previas curtas.");
        }
        if (videoId != null && videoId.startsWith(AUDIUS_PREFIX)) {
            throw new IllegalStateException("Fonte alternativa removida para evitar musicas incompletas.");
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
            if (isCachedYoutubeAudioValid(videoId, arquivoMp3)) {
                return arquivoMp3;
            }
            System.err.println("Cache inválido/removido para " + videoId + ": áudio curto ou incompleto.");
            invalidateAudioValidation(videoId);
            if (!arquivoMp3.delete()) {
                arquivoMp3.deleteOnExit();
            }
        }

        File temporaryCookies = null;
        try {
            System.out.println("Iniciando download e conversão para MP3...");
            List<String> command = new ArrayList<>();
            command.add(ytDlpPath);
            addYoutubeAccessOptions(command);
            temporaryCookies = addCookiesIfConfigured(command);
            command.add("-x");
            command.add("--no-playlist");
            command.add("--concurrent-fragments");
            command.add("1");
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
            waitForYoutubeRequestSlot();
            Process process = builder.start();

            BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
            Deque<String> outputTail = new ArrayDeque<>();
            String outputLine;
            while ((outputLine = reader.readLine()) != null) {
                if (outputTail.size() == 20) {
                    outputTail.removeFirst();
                }
                outputTail.addLast(outputLine);
            }

            int exitCode = process.waitFor();

            if (exitCode == 0 && arquivoMp3.exists() && isValidYoutubeAudio(arquivoMp3)) {
                rememberValidAudio(videoId, arquivoMp3);
                System.out.println("Download concluído com sucesso!");
                return arquivoMp3;
            }
            if (arquivoMp3.exists()) {
                System.err.println("Download inválido para " + videoId + ": arquivo curto ou incompleto. Removendo cache.");
                invalidateAudioValidation(videoId);
                if (!arquivoMp3.delete()) {
                    arquivoMp3.deleteOnExit();
                }
            }
            String details = String.join(System.lineSeparator(), outputTail);
            System.err.println("yt-dlp falhou para " + videoId + " (código " + exitCode + "): " + details);
            if (isYoutubeAccessBlockedMessage(details)) {
                markYoutubeTemporarilyBlocked(details);
            }
            throw new IllegalStateException(details.isBlank()
                    ? "yt-dlp encerrou com código " + exitCode
                    : details);
        } catch (Exception e) {
            System.err.println("Erro crítico ao baixar áudio: " + e.getMessage());
            if (isYoutubeAccessBlockedMessage(e.getMessage())) {
                markYoutubeTemporarilyBlocked(e.getMessage());
            }
            if (e instanceof IllegalStateException illegalStateException) {
                throw illegalStateException;
            }
            throw new IllegalStateException("Falha ao executar o yt-dlp: " + e.getMessage(), e);
        } finally {
            deleteTemporaryCookies(temporaryCookies);
        }
    }

    private boolean isValidYoutubeAudio(File file) {
        if (file == null || !file.isFile() || file.length() < MIN_YOUTUBE_AUDIO_BYTES) {
            return false;
        }

        Double duration = probeAudioDurationSeconds(file);
        return duration == null || duration >= MIN_YOUTUBE_AUDIO_DURATION_SECONDS;
    }

    private boolean isCachedYoutubeAudioValid(String videoId, File file) {
        if (file == null || !file.isFile() || file.length() < MIN_YOUTUBE_AUDIO_BYTES) {
            return false;
        }

        long now = System.currentTimeMillis();
        AudioValidation cached = audioValidationCache.get(videoId);
        if (cached != null && cached.matches(file, now)) {
            return cached.valid();
        }

        boolean valid = isValidYoutubeAudio(file);
        audioValidationCache.put(videoId, new AudioValidation(
                file.length(),
                file.lastModified(),
                now,
                valid
        ));
        return valid;
    }

    private void rememberValidAudio(String videoId, File file) {
        if (file == null || !file.isFile()) return;
        audioValidationCache.put(videoId, new AudioValidation(
                file.length(),
                file.lastModified(),
                System.currentTimeMillis(),
                true
        ));
    }

    private void invalidateAudioValidation(String videoId) {
        if (videoId != null && !videoId.isBlank()) {
            audioValidationCache.remove(videoId);
        }
    }

    private Double probeAudioDurationSeconds(File file) {
        try {
            String ffprobeExecutable = "ffprobe";
            if (ffmpegPath != null && !ffmpegPath.isBlank()) {
                File configured = new File(ffmpegPath);
                if (configured.isDirectory()) {
                    ffprobeExecutable = new File(configured, "ffprobe").getAbsolutePath();
                } else {
                    File parent = configured.getParentFile();
                    if (parent != null) {
                        ffprobeExecutable = new File(parent, "ffprobe").getAbsolutePath();
                    }
                }
            }

            Process process = new ProcessBuilder(
                    ffprobeExecutable,
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "default=noprint_wrappers=1:nokey=1",
                    file.getAbsolutePath()
            ).redirectErrorStream(true).start();

            String output;
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                output = reader.readLine();
            }
            int exitCode = process.waitFor();
            if (exitCode != 0 || output == null || output.isBlank()) {
                return null;
            }
            return Double.parseDouble(output.trim());
        } catch (Exception e) {
            System.err.println("Não foi possível medir duração de " + file.getName() + ": " + e.getMessage());
            return null;
        }
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
