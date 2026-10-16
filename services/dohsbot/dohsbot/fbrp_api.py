from __future__ import annotations

import asyncio
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


class FbrpApiError(RuntimeError):
    pass


class FbrpApi:
    """Read-only client for the FBRP portal's organization and duty-hours API."""

    def __init__(self, base_url: str | None = None, token: str | None = None):
        self.base_url = (base_url or os.getenv("FBRP_API_URL", "")).strip().rstrip("/")
        self.token = (token or os.getenv("FBRP_API_TOKEN", "")).strip()

    @property
    def configured(self) -> bool:
        return bool(self.base_url and self.token)

    def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        return self._request("GET", path, params=params)

    def _request(self, method: str, path: str, params: dict[str, Any] | None = None,
                 payload: dict[str, Any] | None = None) -> dict[str, Any]:
        if not self.configured:
            raise FbrpApiError("FBRP_API_URL and FBRP_API_TOKEN are not set.")
        query = urllib.parse.urlencode({k: v for k, v in (params or {}).items() if v is not None})
        headers = {"Authorization": f"Bearer {self.token}", "Accept": "application/json"}
        if payload is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(
            f"{self.base_url}{path}{'?' + query if query else ''}",
            data=json.dumps(payload).encode() if payload is not None else None,
            method=method,
            headers=headers,
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            try:
                detail = json.load(error).get("error", "")
            except Exception:
                detail = ""
            raise FbrpApiError(detail or f"FBRP API returned {error.code}.") from None
        except (urllib.error.URLError, TimeoutError, ValueError) as error:
            raise FbrpApiError("Could not reach the FBRP API.") from error

    async def org(self, org_ref: str) -> dict[str, Any]:
        quoted = urllib.parse.quote(str(org_ref), safe="")
        return (await asyncio.to_thread(self._get, f"/api/gangs/org/{quoted}"))["org"]

    async def hours(self, org_ref: str, since_ms: int | None = None, until_ms: int | None = None,
                    discord_id: int | None = None) -> dict[str, Any]:
        quoted = urllib.parse.quote(str(org_ref), safe="")
        return await asyncio.to_thread(
            self._get, f"/api/gangs/org/{quoted}/hours",
            {"since": since_ms, "until": until_ms, "discord_id": discord_id},
        )

    async def service_role_holders(self, service: str = "dohs") -> dict[str, Any]:
        """Who holds the service's roles in the main server: {"holders": {role_id: [discord_id, ...]}}."""
        return await asyncio.to_thread(self._get, f"/api/gangs/service-roles/{urllib.parse.quote(service, safe='')}")

    async def queue_service_roles(self, changes: list[dict[str, Any]], service: str = "dohs") -> int:
        """Ask the main bot to add/remove main-server roles. Each change: discord_id, role_id, action, reason."""
        queued = 0
        for start in range(0, len(changes), 200):
            data = await asyncio.to_thread(
                self._request, "POST", f"/api/gangs/service-roles/{urllib.parse.quote(service, safe='')}",
                None, {"changes": changes[start:start + 200]})
            queued += int(data.get("queued", 0))
        return queued
