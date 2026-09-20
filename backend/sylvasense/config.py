"""Typed settings. Anything environment-dependent lives here and nowhere else."""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="SYLVA_", env_file=".env", extra="ignore"
    )

    # ---- catalogues -------------------------------------------------------
    #: anonymous for sentinel-1-rtc, sentinel-2-l2a, hls2-*; the default path
    pc_stac_url: str = "https://planetarycomputer.microsoft.com/api/stac/v1"
    #: second source; needs credentials, so it is optional by design
    cdse_stac_url: str = "https://stac.dataspace.copernicus.eu/v1"
    cdse_client_id: str | None = None
    cdse_client_secret: str | None = None

    #: credential-gated layers. Absent means "degrade and say so", not "crash".
    earthdata_token: str | None = None  # GEDI, ICESat-2
    gfw_api_key: str | None = None  # RADD / GLAD / integrated alerts

    # ---- cache ------------------------------------------------------------
    cache_dir: Path = REPO_ROOT / ".cache"
    #: when true, never hit the network — replay whatever is cached. Every
    #: batch after data access must pass its tests in this mode.
    offline: bool = False
    #: how old a cached answer may be before it is reported as stale
    stale_after_days: float = 7.0

    # ---- analysis defaults ------------------------------------------------
    #: EUDR's cut-off. Baselines are anchored here unless overridden.
    cutoff_date: str = "2020-12-31"
    #: equal-area working CRS. South America Albers; swap per region.
    working_crs: str = "ESRI:102033"
    grid_size_m: float = 10.0

    #: fraction of an AOI that must be cloud-free for an optical answer to count
    min_clear_fraction: float = 0.25
    #: below this many usable SAR scenes, the disturbance answer is degraded
    min_sar_scenes: int = 6

    log_level: str = "INFO"

    @property
    def has_cdse(self) -> bool:
        return bool(self.cdse_client_id and self.cdse_client_secret)


settings = Settings()
