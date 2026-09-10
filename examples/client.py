"""Call the installed informe-pdf CLI. No long-running PDF service is required."""
import json
import os
import subprocess


def render_pdf(payload: dict, timeout: int = 90) -> bytes:
    command = os.environ.get("INFORME_PDF_CLI", "informe-pdf")
    result = subprocess.run(
        [command, "render"],
        input=json.dumps(payload).encode("utf-8"),
        capture_output=True,
        timeout=timeout,
        check=False,
        env=os.environ,
    )
    if result.returncode != 0 or not result.stdout.startswith(b"%PDF-"):
        raise RuntimeError(result.stderr.decode("utf-8", errors="replace") or "informe-pdf failed")
    return result.stdout


# FastAPI: return Response(render_pdf(payload), media_type="application/pdf")
# Django: return HttpResponse(render_pdf(payload), content_type="application/pdf")
# Finalization: save bytes to the application-managed path before committing final state.
