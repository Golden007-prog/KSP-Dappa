"""Catalyst Mail digest for the nightly refresh.

Real path
    ``app.email()`` -> the Catalyst Mail component, invoked with the mail
    object ``{from_email, to_email, subject, content}``.

    The Python SDK is only installed in the Catalyst runtime, so the send
    method is resolved by name at call time (``send_mail`` / ``sendMail``)
    rather than imported: a naming difference degrades to the preview instead
    of raising inside a cron run. If none of the candidates exist the digest is
    logged and ``mode`` reports ``no-send-method`` — honest, not silent.

Flag
    ``FEATURE_MAIL`` (off by default). ``MAIL_FROM`` must be a sender address
    verified in the Catalyst console; ``DIGEST_TO`` is a comma-separated list.

Fallback
    The fully rendered digest is returned (and logged) as ``preview``, so a
    misconfigured mail setup can never fail the nightly refresh — the refresh
    itself has already been written by the time this runs.
"""

import logging
import os

LOGGER = logging.getLogger("dappa_nightly.notify")

_TRUTHY = {"on", "true", "1", "yes", "enabled"}
_SEND_METHODS = ("send_mail", "sendMail")
_MAX_LINES = 10


def _flag_on(name):
    return os.environ.get(name, "").strip().lower() in _TRUTHY


def _recipients():
    return [a.strip() for a in os.environ.get("DIGEST_TO", "").split(",") if a.strip()]


def build_digest(alerts_df, meta):
    """Render the digest from the recomputed alert frame. Pure — never sends."""
    lines = []
    if alerts_df is not None and len(alerts_df):
        ordered = alerts_df.sort_values("Severity", ascending=False).head(_MAX_LINES)
        for _, r in ordered.iterrows():
            lines.append(f"[S{int(r['Severity'])}] {r['Narrative']}")
    count = len(lines)
    subject = f"KSP DAPPA digest — {count} active alert{'' if count == 1 else 's'}"
    body = [subject, ""] + lines
    if meta:
        body += [
            "",
            f"Refreshed at {meta.get('last_refresh')} · "
            f"{meta.get('cases_read', 0)} cases read · "
            f"{meta.get('stations_scored', 0)} stations scored",
        ]
    app_url = os.environ.get("APP_BASE_URL", "").strip()
    if app_url:
        body += ["", f"Open the dashboard: {app_url}"]
    return {"subject": subject, "lines": lines, "text": "\n".join(body)}


def send_digest(app, digest):
    """Send through Catalyst Mail when enabled; always return the preview.

    Never raises: the caller is a cron handler whose real work is already
    persisted.
    """
    to = _recipients()
    sender = os.environ.get("MAIL_FROM", "").strip()
    result = {"sent": False, "to": to, "from": sender or None, "preview": digest}

    if not _flag_on("FEATURE_MAIL"):
        result["mode"] = "disabled"
        LOGGER.info("digest not sent (FEATURE_MAIL off): %s", digest["subject"])
        return result
    if not sender or not to:
        result["mode"] = "not-configured"
        LOGGER.warning("digest not sent: set MAIL_FROM and DIGEST_TO")
        return result
    try:
        email = app.email()
        send = next((getattr(email, n) for n in _SEND_METHODS if hasattr(email, n)), None)
        if send is None:
            result["mode"] = "no-send-method"
            LOGGER.warning("digest not sent: Catalyst Mail component exposes none of %s",
                           ", ".join(_SEND_METHODS))
            return result
        send({
            "from_email": sender,
            "to_email": to,
            "subject": digest["subject"],
            "content": digest["text"],
        })
        result["sent"] = True
        result["mode"] = "sent"
        LOGGER.info("digest sent to %d recipient(s)", len(to))
    except Exception as exc:  # noqa: BLE001 — a failed mail must not fail the cron
        result["mode"] = "error-fallback"
        result["error"] = str(exc)
        LOGGER.warning("digest send failed (%s); preview logged instead", exc)
    return result
