from __future__ import annotations
import asyncio
import logging
import os

from .ingest import ingest_registry_homepages

log = logging.getLogger("fbi_security.scheduler")
INTERVAL = max(15, int(os.getenv("POLL_INTERVAL_MINUTES", "60"))) * 60


async def poll_loop() -> None:
    """Periodic allowlisted public-source check. Network work runs off the event loop."""
    while True:
        try:
            result = await asyncio.to_thread(ingest_registry_homepages)
            log.info("Public-source polling finished: ingested=%s errors=%s",
                     result.get("ingested", 0), len(result.get("errors", [])))
        except Exception:
            log.exception("Public-source polling cycle failed")
        await asyncio.sleep(INTERVAL)
