FROM eclipse-temurin:21-jre-jammy

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg python3 python3-pip unzip \
    && pip3 install --no-cache-dir spotifyscraper==3.7.0 \
    && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
       -o /usr/local/bin/yt-dlp \
    && curl -fsSL https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip \
       -o /tmp/deno.zip \
    && unzip -q /tmp/deno.zip -d /usr/local/bin \
    && chmod 0755 /usr/local/bin/yt-dlp \
    && chmod 0755 /usr/local/bin/deno \
    && rm -f /tmp/deno.zip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY music-api.jar /app/music-api.jar
COPY spotify_playlist.py /app/spotify_playlist.py

RUN mkdir -p /app/downloads \
    && chown -R 10001:10001 /app

USER 10001:10001
EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/music-api.jar"]
