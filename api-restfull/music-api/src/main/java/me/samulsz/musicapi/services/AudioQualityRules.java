package me.samulsz.musicapi.services;

import java.util.*;

final class AudioQualityRules {
    record Finding(String code, double confidence, String evidence) {}

    static List<Finding> evaluate(String title, String album, String sourceTitle,
                                  Double lufs, Double peak, Double silenceRatio) {
        var findings = new ArrayList<Finding>();
        if (lufs != null && lufs < -22) findings.add(new Finding("LOW_VOLUME", 1,
                String.format(Locale.ROOT, "Volume integrado %.1f LUFS (limiar: -22).", lufs)));
        if (peak != null && peak > 1.5) findings.add(new Finding("HIGH_TRUE_PEAK", 1,
                String.format(Locale.ROOT, "Pico verdadeiro %.1f dBTP; possível sobrecarga, não prova de distorção.", peak)));
        if (silenceRatio != null && silenceRatio > .15) findings.add(new Finding("EXCESSIVE_SILENCE", 1,
                String.format(Locale.ROOT, "%.0f%% da faixa abaixo de -50 dB por pelo menos 2 segundos.", silenceRatio * 100)));
        String expected = " " + CatalogIdentity.normalize(title + " " + Objects.toString(album, "")) + " ";
        String source = " " + CatalogIdentity.normalize(sourceTitle) + " ";
        for (String marker : List.of("8d", "8 d", "slowed", "sped up", "reverb", "nightcore")) {
            if (source.contains(" " + marker + " ") && !expected.contains(" " + marker + " ")) {
                findings.add(new Finding("ALTERED_VERSION", .98, "Fonte identifica efeito/versão: " + marker + "."));
                break;
            }
        }
        for (String marker : List.of("instrumental", "karaoke", "playback", "type beat", "typebeat")) {
            if (source.contains(" " + marker + " ") && !expected.contains(" " + marker + " ")) {
                findings.add(new Finding("POSSIBLE_INSTRUMENTAL", .95, "Fonte identifica " + marker + "; presença de voz não analisada por IA."));
                break;
            }
        }
        if (source.contains(" free ") && (source.contains(" prod ") || source.contains(" beat "))
                && !expected.contains(" free ") && findings.stream().noneMatch(f -> f.code().equals("POSSIBLE_INSTRUMENTAL")))
            findings.add(new Finding("POSSIBLE_INSTRUMENTAL", .6, "Fonte anuncia beat gratuito/produção; revisar, pois pode ser uma música legítima."));
        boolean requestedLive = java.util.stream.Stream.of("ao vivo", "live", "concert", "festival")
                .anyMatch(marker -> expected.contains(" " + marker + " "));
        if (!requestedLive && java.util.stream.Stream.of("ao vivo", "live", "show completo", "concert", "festival")
                .anyMatch(marker -> source.contains(" " + marker + " ")))
            findings.add(new Finding("POSSIBLE_LIVE_VERSION", .95, "Fonte indica show/ao vivo, mas título e álbum cadastrados não solicitam essa versão."));
        return findings;
    }
}
