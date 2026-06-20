package me.samulsz.musicapi.services;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class MusicService {

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
                    resultados.add(Map.of(
                            "id", partes[0],
                            "titulo", partes[1],
                            "artista", partes[2],
                            "capa", partes[3]
                    ));
                }
            }
            process.waitFor();
        } catch (Exception e) {
            System.err.println("Erro ao buscar música: " + e.getMessage());
        } finally {
            deleteTemporaryCookies(temporaryCookies);
        }
        return resultados;
    }

    public File baixarAudio(String videoId) {
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
}
