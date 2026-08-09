FROM eclipse-temurin:21-jre-jammy

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg python3 python3-pip unzip \
    && pip3 install --no-cache-dir --pre "yt-dlp[default]" \
       bgutil-ytdlp-pot-provider==1.3.1 \
       spotifyscraper==3.7.0 \
    && curl -fsSL https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip \
       -o /tmp/deno.zip \
    && unzip -q /tmp/deno.zip -d /usr/local/bin \
    && chmod 0755 /usr/local/bin/deno \
    && rm -f /tmp/deno.zip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY music-api.jar /app/music-api.jar
COPY spotify_playlist.py /app/spotify_playlist.py
COPY import_spotify_global_playlist.py /app/import_spotify_global_playlist.py
COPY precache_spotify_playlist.py /app/precache_spotify_playlist.py
COPY hydrate_spotify_playlist_via_api.py /app/hydrate_spotify_playlist_via_api.py

RUN mkdir -p /app/downloads \
    && chown -R 10001:10001 /app

USER 10001:10001
EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/music-api.jar"]
