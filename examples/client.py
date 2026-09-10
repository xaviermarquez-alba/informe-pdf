"""Shared request payload for FastAPI (async) and Django (sync).
Requires httpx; configure PDF_SERVICE_URL and PDF_SERVICE_TOKEN in the caller.
"""
import os
import httpx

def _config():
    return (
        os.environ.get("PDF_SERVICE_URL", "http://127.0.0.1:8090").rstrip("/") + "/render",
        {"Authorization": "Bearer " + os.environ["PDF_SERVICE_TOKEN"]},
    )

async def render_pdf_async(payload: dict) -> bytes:
    url, headers = _config()
    async with httpx.AsyncClient(timeout=90) as client:
        response = await client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        return response.content

def render_pdf_sync(payload: dict) -> bytes:
    url, headers = _config()
    with httpx.Client(timeout=90) as client:
        response = client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        return response.content

# FastAPI: return Response(await render_pdf_async(payload), media_type="application/pdf")
# Django: return HttpResponse(render_pdf_sync(payload), content_type="application/pdf")
# Finalization: save bytes to the application-managed path before committing final state.
