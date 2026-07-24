"""LOCAL_DRYRUN storage layer: table CSVs in DAPPA_OUT instead of Data Store.

Reads ``<DAPPA_OUT>/<TableName>.csv`` and writes every refreshed artifact to
``<DAPPA_OUT>/_nightly_out/`` so the whole nightly job is testable without a
Catalyst project.
"""

import json
import os

import pandas as pd

OUT_SUBDIR = "_nightly_out"


def read_table(out_dir, table_name):
    """CSV -> DataFrame with every cell as a string ('' for blanks); None when
    the table CSV does not exist (all lookups are optional)."""
    path = os.path.join(out_dir, f"{table_name}.csv")
    if not os.path.isfile(path):
        return None
    return pd.read_csv(path, dtype=str, keep_default_na=False)


def write_outputs(out_dir, agg_df, delta_df, alerts_df, risk_df, forecast_df, meta):
    dest = os.path.join(out_dir, OUT_SUBDIR)
    os.makedirs(dest, exist_ok=True)
    agg_df.to_csv(os.path.join(dest, "AggMonthly.csv"), index=False)
    delta_df.to_csv(os.path.join(dest, "AggMonthly_delta.csv"), index=False)
    alerts_df.to_csv(os.path.join(dest, "AnomalyAlert.csv"), index=False)
    risk_df.to_csv(os.path.join(dest, "StationRisk.csv"), index=False)
    forecast_df.to_csv(os.path.join(dest, "ForecastMonthly.csv"), index=False)
    with open(os.path.join(dest, "refresh_meta.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2, sort_keys=True)
    return dest
