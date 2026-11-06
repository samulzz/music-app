package me.samulsz.musicapi.services;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

@Service
public class AudioQualityAnalyzer {
    private final ObjectMapper mapper;
    @Value("${tools.ffmpeg-path:ffmpeg}") private String ffmpegPath;
    public AudioQualityAnalyzer(ObjectMapper mapper) { this.mapper = mapper; }
    record Measurement(Double integratedLufs, Double truePeakDb, Double silenceRatio) {}

    Measurement measure(File audio, double duration) throws Exception {
        Path log = Files.createTempFile("nationmusics-audio-quality-", ".log");
        Process process = null;
        try {
            File configured = new File(ffmpegPath);
            String executable = configured.isDirectory() ? new File(configured, "ffmpeg").getPath() : ffmpegPath;
            process = new ProcessBuilder(executable, "-nostdin", "-hide_banner", "-nostats",
                    "-threads", "1", "-filter_threads", "1", "-i", audio.getAbsolutePath(),
                    "-af", "silencedetect=noise=-50dB:d=2,loudnorm=I=-14:TP=-1:LRA=11:print_format=json",
                    "-f", "null", "-").redirectErrorStream(true).redirectOutput(log.toFile()).start();
            if (!process.waitFor(45, TimeUnit.SECONDS)) throw new IllegalStateException("Tempo limite na análise; arquivo preservado.");
            if (process.exitValue() != 0) throw new IllegalStateException("FFmpeg não conseguiu analisar; arquivo preservado.");
            // FFmpeg output is redirected while running, preventing a full pipe deadlock.
            String output = Files.readString(log, StandardCharsets.UTF_8);
            return parse(output, duration);
        } finally {
            if (process != null && process.isAlive()) { process.destroyForcibly(); process.waitFor(3, TimeUnit.SECONDS); }
            Files.deleteIfExists(log);
        }
    }

    Measurement parse(String output, double duration) {
        int start = output.lastIndexOf('{'), end = output.indexOf('}', start);
        if (start < 0 || end < start) throw new IllegalStateException("Medição de volume indisponível.");
        var json = mapper.readTree(output.substring(start, end + 1));
        Double lufs = finite(json.path("input_i").asText("")), peak = finite(json.path("input_tp").asText(""));
        double silentSeconds = 0;
        var matcher = Pattern.compile("silence_duration:\\s*([0-9.]+)").matcher(output);
        while (matcher.find()) silentSeconds += Double.parseDouble(matcher.group(1));
        // All-silent audio yields -inf rather than a finite LUFS value.
        return new Measurement(lufs, peak, duration > 0 ? Math.min(1, silentSeconds / duration) : null);
    }

    private Double finite(String value) {
        try { double number = Double.parseDouble(value); return Double.isFinite(number) ? number : null; }
        catch (NumberFormatException ignored) { return null; }
    }
}
