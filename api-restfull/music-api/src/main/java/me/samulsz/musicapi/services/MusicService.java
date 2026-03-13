package me.samulsz.musicapi.services;

import org.springframework.stereotype.Service;
import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class MusicService {

    public List<Map<String, String>> buscarNoYouTube(String query) {
        List<Map<String, String>> resultados = new ArrayList<>();
        
        try {
            ProcessBuilder builder = new ProcessBuilder(
                    "F:\\dev\\utils\\yt-dlp.exe",
                    "ytsearch5:" + query,
                    "--print", "%(id)s|%(title)s|%(uploader)s|%(thumbnail)s"
            );

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

        try {
            System.out.println("Iniciando download e conversão para MP3...");
            ProcessBuilder builder = new ProcessBuilder(
                    "F:\\dev\\utils\\yt-dlp.exe",
                    "-x",
                    "--audio-format", "mp3",
                    "--ffmpeg-location", "F:\\dev\\utils",
                    "-o", diretorioSaida + "%(id)s.%(ext)s",
                    url
            );

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
        }

        return null;
    }
}