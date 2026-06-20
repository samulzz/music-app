FROM eclipse-temurin:21-jre-jammy

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg python3 \
    && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
       -o /usr/local/bin/yt-dlp \
    && chmod 0755 /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY music-api.jar /app/music-api.jar

RUN mkdir -p /app/downloads \
    && chown -R 10001:10001 /app

USER 10001:10001
EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/music-api.jar"]
