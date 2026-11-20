"""Zero-dependency Python 3 client example for Veritas Content Intelligence API."""

import json
import os
import urllib.request


class VeritasClient:
    def __init__(self, base_url: str | None = None, api_key: str | None = None) -> None:
        self.base_url = (base_url or os.getenv("VERITAS_URL") or "http://127.0.0.1:3000").rstrip("/")
        self.api_key = api_key or os.getenv("VERITAS_API_KEY")

    def _request(self, method: str, path: str, payload: dict | None = None) -> dict:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["x-api-key"] = self.api_key
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        req = urllib.request.Request(f"{self.base_url}{path}", data=data, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def health(self) -> dict:
        return self._request("GET", "/api/health")

    def detect(self, text: str, title: str | None = None) -> dict:
        return self._request("POST", "/api/v1/detect", {"text": text, "title": title})

    def inspect_security(self, text: str) -> dict:
        return self._request("POST", "/api/v1/security/inspect", {"text": text})


if __name__ == "__main__":
    client = VeritasClient()
    print("Health:", client.health())
    result = client.detect(
        "Furthermore, it is important to note that organizations leverage multifaceted AI frameworks.",
        title="Python SDK Test",
    )
    print(
        "Detection:",
        {
            "id": result["id"],
            "verdict": result["verdict"],
            "aiProbability": result["aiProbability"],
        },
    )
    print("Security:", client.inspect_security("Reach me at researcher@university.edu"))
