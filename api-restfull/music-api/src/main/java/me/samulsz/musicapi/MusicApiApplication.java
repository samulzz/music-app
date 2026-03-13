package me.samulsz.musicapi;

import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

@SpringBootApplication
public class MusicApiApplication {

    public static void main(String[] args) {
        SpringApplication.run(MusicApiApplication.class, args);
        try {
            HttpClient client = HttpClient.newHttpClient();
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create("https://api.ipify.org"))
                    .build();

            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            String ipPublico = response.body();

            System.out.println("\n=======================================================");
            System.out.println("🚀 SERVIDOR SOULSEEKER ONLINE!");
            System.out.println("🌐 SEU IP PÚBLICO É: " + ipPublico);
            System.out.println("🔗 TESTE NO NAVEGADOR: http://" + ipPublico + ":8080/api/musicas/status");
            System.out.println("=======================================================\n");

        } catch (Exception e) {
            System.out.println("Servidor online, mas não foi possível descobrir o IP Público externo.");
        }
    }

}