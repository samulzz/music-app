package me.samulsz.musicapi.controllers;

import me.samulsz.musicapi.services.MusicService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import java.io.File;
import java.nio.charset.StandardCharsets;
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
        return "Servidor online com acesso automático ao YouTube.";
    }

    @GetMapping("/baixar/{id}")
    public ResponseEntity<?> baixarMusica(
            @PathVariable String id,
            @RequestParam(defaultValue = "musica_legal") String titulo,
            @RequestParam(defaultValue = "") String artista) {

        System.out.println("Baixando: " + titulo + " (ID: " + id + ")");

        File arquivoDeAudio;
        try {
            arquivoDeAudio = musicService.baixarAudio(id, titulo, artista);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .contentType(MediaType.TEXT_PLAIN)
                    .body(downloadErrorMessage(e));
        }

        if (arquivoDeAudio == null || !arquivoDeAudio.exists()) {
            return ResponseEntity.notFound().build();
        }

        Resource resource = new FileSystemResource(arquivoDeAudio);

        String nomeLimpo = titulo
                .replaceAll("[\\r\\n\\\\/:*?\"<>|]", "")
                .trim();
        if (nomeLimpo.isBlank()) {
            nomeLimpo = "musica";
        }
        String contentDisposition = ContentDisposition.attachment()
                .filename(nomeLimpo + ".mp3", StandardCharsets.UTF_8)
                .build()
                .toString();

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("audio/mpeg"))
                .header(HttpHeaders.CONTENT_DISPOSITION, contentDisposition)
                .body(resource);
    }

    private String downloadErrorMessage(Exception error) {
        String message = error.getMessage() == null ? "" : error.getMessage();
        String normalized = message.toLowerCase();
        if (normalized.contains("sign in to confirm you")
                || normalized.contains("not a bot")
                || normalized.contains("unusual traffic")
                || normalized.contains("http error 429")
                || normalized.contains("too many requests")) {
            return "O YouTube recusou temporariamente o acesso do servidor para esta musica.";
        }
        if (normalized.contains("po token")
                || normalized.contains("pot provider")
                || normalized.contains("bgutil")) {
            return "O gerador de acesso do YouTube esta indisponivel no servidor.";
        }
        if (normalized.contains("video unavailable")
                || normalized.contains("private video")
                || normalized.contains("has been removed")) {
            return "Esta musica nao esta disponivel no YouTube.";
        }
        if (normalized.contains("copyright")) {
            return "Esta musica foi bloqueada pelo YouTube.";
        }
        return "Nao foi possivel baixar esta musica agora.";
    }

    @PostMapping("/preparar/{id}")
    public ResponseEntity<?> prepararMusica(
            @PathVariable String id,
            @RequestParam(defaultValue = "") String titulo,
            @RequestParam(defaultValue = "") String artista) {
        return ResponseEntity.accepted().body(musicService.prepararAudio(id, titulo, artista));
    }

    @GetMapping("/preparar/{id}/status")
    public ResponseEntity<?> statusPreparacao(@PathVariable String id) {
        return ResponseEntity.ok(musicService.statusAudio(id));
    }
}
