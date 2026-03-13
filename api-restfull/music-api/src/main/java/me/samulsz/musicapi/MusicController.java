package me.samulsz.musicapi;

import me.samulsz.musicapi.services.MusicService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import java.io.File;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/musicas")
public class MusicController {

    private final MusicService musicService;

    public MusicController(MusicService musicService) {
        this.musicService = musicService;
    }

    @GetMapping("/buscar")
    public List<Map<String, String>> buscarMusica(@RequestParam String q) {
        System.out.println("Buscando no YouTube por: " + q);
        return musicService.buscarNoYouTube(q);
    }

    @GetMapping("/status")
    public String status() {
        return "Servidor Online e Conectado ao YouTube! 🚀";
    }

    @GetMapping("/baixar/{id}")
    public ResponseEntity<Resource> baixarMusica(
            @PathVariable String id,
            @RequestParam(defaultValue = "musica_legal") String titulo) {

        System.out.println("Baixando: " + titulo + " (ID: " + id + ")");

        File arquivoDeAudio = musicService.baixarAudio(id);

        if (arquivoDeAudio == null || !arquivoDeAudio.exists()) {
            return ResponseEntity.notFound().build();
        }

        Resource resource = new FileSystemResource(arquivoDeAudio);

        String nomeLimpo = titulo.replaceAll("[\\\\/:*?\"<>|]", "");

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("audio/mpeg"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + nomeLimpo + ".mp3\"")
                .body(resource);
    }
}