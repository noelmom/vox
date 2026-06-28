import os
import shutil
from pathlib import Path

from fastapi import APIRouter

from api.core.config import settings

router = APIRouter(prefix="/alerts", tags=["system"])


@router.get(
    "",
    summary="List active system alerts",
    description="Returns active local system conditions that may affect generation or export.",
)
async def list_alerts():
    alerts = []

    output_dir = Path(settings.output_dir)
    try:
        usage = shutil.disk_usage(output_dir)
        free_gb = usage.free / 1_073_741_824
        if usage.free < 1_073_741_824:
            alerts.append({
                "id": "low_disk",
                "level": "warning",
                "message": f"Disk space is low ({free_gb:.1f} GB free). Old outputs may not be cleaned up in time.",
            })
    except OSError:
        alerts.append({
            "id": "disk_check_failed",
            "level": "warning",
            "message": "Vox could not check free disk space for the output folder.",
        })

    if not os.access(output_dir, os.W_OK):
        alerts.append({
            "id": "output_not_writable",
            "level": "error",
            "message": "The Vox output folder is not writable. Audio generation cannot save completed files.",
        })

    ffmpeg_path = Path(settings.ffmpeg_path)
    if not ffmpeg_path.exists() or not os.access(ffmpeg_path, os.X_OK):
        alerts.append({
            "id": "no_ffmpeg",
            "level": "error",
            "message": "ffmpeg was not found or is not executable. MP3 export will fail until ffmpeg is installed.",
        })

    return alerts
