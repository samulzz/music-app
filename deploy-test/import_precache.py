import base64
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


def base64url(value):
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def create_token(username, secret):
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {"sub": username, "iat": now, "exp": now + 3600}
    encoded_header = base64url(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    encoded_payload = base64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    unsigned = f"{encoded_header}.{encoded_payload}"
    signature = hmac.new(secret.encode("utf-8"), unsigned.encode("ascii"), hashlib.sha256).digest()
    return f"{unsigned}.{base64url(signature)}"


def request_json(url, token, api_key, method="GET", payload=None):
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json; charset=utf-8",
        "Accept": "application/json, text/plain",
    }
    if api_key:
        headers["X-API-KEY"] = api_key

    request = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers=headers,
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        response_body = response.read().decode("utf-8")
        return json.loads(response_body) if response_body.startswith(("[", "{")) else response_body


def main():
    if len(sys.argv) < 4:
        raise ValueError("Uso: import_precache.py MANIFEST API_BASE USERNAME")

    manifest_path = Path(sys.argv[1])
    api_base = sys.argv[2].rstrip("/")
    username = sys.argv[3]
    api_key = os.environ.get("API_SECURITY_KEY") or os.environ.get("API_KEY") or ""
    secret = os.environ.get("JWT_SECRET", "")
    if not secret:
        raise ValueError("A variável JWT_SECRET não foi definida.")

    entries = json.loads(manifest_path.read_text(encoding="utf-8"))
    token = create_token(username, secret)
    imported = 0
    failures = []

    for index, entry in enumerate(entries, start=1):
        source_id = entry["sourceId"]
        stream_url = (
            f"{api_base}/musicas/baixar/{urllib.parse.quote(source_id)}"
            f"?titulo={urllib.parse.quote(entry['title'])}"
        )
        payload = {
            "title": entry["title"],
            "artist": entry["artist"],
            "uri": stream_url,
            "coverUrl": entry.get("coverUrl", ""),
            "sourceId": source_id,
        }
        try:
            request_json(f"{api_base}/songs/save", token, api_key, method="POST", payload=payload)
            imported += 1
            print(f"[{index}/{len(entries)}] OK {entry['title']}", flush=True)
        except urllib.error.HTTPError as error:
            details = error.read().decode("utf-8", errors="replace")
            failures.append({"sourceId": source_id, "error": f"HTTP {error.code}: {details}"})
            print(f"[{index}/{len(entries)}] ERRO {entry['title']}: {failures[-1]['error']}", flush=True)

    library = request_json(f"{api_base}/songs/my-library", token, api_key)
    library_source_ids = {song.get("sourceId") for song in library}
    expected_source_ids = {entry["sourceId"] for entry in entries}
    missing = sorted(expected_source_ids - library_source_ids)

    print(json.dumps({
        "manifestEntries": len(entries),
        "uniqueSources": len(expected_source_ids),
        "importedRequests": imported,
        "failures": failures,
        "librarySongs": len(library),
        "missingSources": missing,
    }, ensure_ascii=False))
    if failures or missing:
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Erro fatal: {error}", file=sys.stderr)
        sys.exit(1)
