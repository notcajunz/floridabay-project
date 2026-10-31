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
    """Client for the FBRP portal's organization and duty-hours API."""

    def __init__(self, base_url: str | None = None, token: str | None = None):
        self.base_url = (base_url or os.getenv("FBRP_API_URL", "")).strip().rstrip("/")
        self.token = (token or os.getenv("FBRP_API_TOKEN", "")).strip()

    @property
    def configured(self) -> bool:
        return bool(self.base_url and self.token)

    def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        return self._request("GET", path, params=params)

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        payload: dict[str, Any] | None = None,
        timeout: int = 10,
    ) -> dict[str, Any]:
        if not self.configured:
            raise FbrpApiError("FBRP_API_URL and FBRP_API_TOKEN are not set.")
        query = urllib.parse.urlencode({k: v for k, v in (params or {}).items() if v is not None})
        body = json.dumps(payload).encode() if payload is not None else None
        request = urllib.request.Request(
            f"{self.base_url}{path}{'?' + query if query else ''}",
            data=body,
            method=method,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
        )
        try:
            for attempt in range(2):
                try:
                    with urllib.request.urlopen(request, timeout=timeout) as response:
                        return json.load(response)
                except urllib.error.HTTPError:
                    raise
                except (urllib.error.URLError, TimeoutError):
                    if method != "POST" or attempt:
                        raise
        except urllib.error.HTTPError as error:
            try:
                detail = json.load(error).get("error", "")
            except Exception:
                detail = ""
            raise FbrpApiError(detail or f"FBRP API returned {error.code}.") from None
        except (urllib.error.URLError, TimeoutError) as error:
            raise FbrpApiError("Could not reach the FBRP API.") from error

    async def org(self, org_ref: str) -> dict[str, Any]:
        quoted = urllib.parse.quote(str(org_ref), safe="")
        return (await asyncio.to_thread(self._get, f"/api/gangs/org/{quoted}"))["org"]

    async def link_access_role(self, org_ref: str, guild_id: int, role_id: int) -> dict[str, Any]:
        return await asyncio.to_thread(
            self._request, "POST", "/api/gangs/org/access-role",
            payload={"org": str(org_ref), "family": "department", "guildId": str(guild_id), "roleId": str(role_id)},
        )

    async def hours(
        self,
        org_ref: str,
        since_ms: int | None = None,
        until_ms: int | None = None,
        discord_id: int | None = None,
    ) -> dict[str, Any]:
        quoted = urllib.parse.quote(str(org_ref), safe="")
        return await asyncio.to_thread(
            self._get,
            f"/api/gangs/org/{quoted}/hours",
            {"since": since_ms, "until": until_ms, "discord_id": discord_id},
        )

    # badge templates (org-badges.js on the website) -------------------------------

    @staticmethod
    def _org_path(org_ref: str, tail: str) -> str:
        return f"/api/gangs/org/{urllib.parse.quote(str(org_ref), safe='')}/{tail}"

    async def badge_overview(self, org_ref: str) -> dict[str, Any]:
        return await asyncio.to_thread(self._get, self._org_path(org_ref, "badges"))

    async def badge_member(self, org_ref: str, discord_id: int) -> dict[str, Any]:
        return await asyncio.to_thread(self._get, self._org_path(org_ref, f"badge/member/{int(discord_id)}"))

    async def badge_template(self, org_ref: str, tier: str, rank_id: int | None = None) -> dict[str, Any]:
        return await asyncio.to_thread(self._get, self._org_path(org_ref, "badge/template"), {"tier": tier, "rank": rank_id})

    async def badge_save(
        self, org_ref: str, tier: str, *, image: str | None = None, fields: dict[str, Any] | None = None,
        actor_id: int | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"tier": tier, "actorId": str(actor_id) if actor_id else None}
        if image:
            payload["image"] = image
        if fields:
            payload["fields"] = fields
        return await asyncio.to_thread(
            lambda: self._request("POST", self._org_path(org_ref, "badge/template"), payload=payload, timeout=60)
        )

    async def badge_remove(self, org_ref: str, tier: str, actor_id: int | None = None) -> dict[str, Any]:
        payload = {"tier": tier, "actorId": str(actor_id) if actor_id else None}
        return await asyncio.to_thread(
            lambda: self._request("POST", self._org_path(org_ref, "badge/template/remove"), payload=payload)
        )
