from __future__ import annotations

import asyncio
import json
import os
import urllib.error
import urllib.request
from typing import Any


class SheetApiError(ValueError):
    """A ValueError so the bot shows the message to the user as-is."""


class SheetApi:
    """Client for the Department Email Database (a Google Apps Script web app).

    Every call is a POST of {secret, action, args}; the script answers JSON with an `ok` flag.
    """

    def __init__(self, url: str | None = None, secret: str | None = None):
        self.url = (url or os.getenv("SHEET_API_URL", "")).strip()
        self.secret = (secret or os.getenv("SHEET_API_SECRET", "")).strip()

    @property
    def configured(self) -> bool:
        return bool(self.url and self.secret)

    def _post(self, action: str, args: dict[str, Any]) -> dict[str, Any]:
        if not self.configured:
            raise SheetApiError("SHEET_API_URL and SHEET_API_SECRET are not set.")
        request = urllib.request.Request(
            self.url,
            data=json.dumps({"secret": self.secret, "action": action, "args": args}).encode(),
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        try:
            # Apps Script answers with a redirect that urllib follows; syncing Drive can be slow.
            with urllib.request.urlopen(request, timeout=120) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code in (401, 403):
                raise SheetApiError(
                    "The email database refused the request. Its web app must be deployed with access set to Anyone."
                ) from None
            raise SheetApiError(f"The email database returned HTTP {error.code}.") from None
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise SheetApiError("Could not reach the email database.") from error
        except ValueError:
            raise SheetApiError("The email database sent an unreadable answer.") from None

    async def call(self, action: str, **args: Any) -> dict[str, Any]:
        """Run an action; raises SheetApiError when the script reports ok=false without a usable payload."""
        return await asyncio.to_thread(self._post, action, args)

    async def checked(self, action: str, **args: Any) -> dict[str, Any]:
        """Like call(), but turns `ok: false` into SheetApiError carrying the script's message."""
        data = await self.call(action, **args)
        if not data.get("ok"):
            raise SheetApiError(str(data.get("error") or "The email database rejected that."))
        return data
