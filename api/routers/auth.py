from __future__ import annotations

from html import escape

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

router = APIRouter(prefix="/auth", tags=["authentication"])


class PairRequest(BaseModel):
    code: str = Field(min_length=8, max_length=16)
    device_name: str = Field(min_length=1, max_length=80)


class TokenRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    scopes: set[str]
    ttl_days: int | None = Field(default=None, ge=1, le=3650)


def _store(request: Request):
    return request.app.state.security_store


def _credential_payload(credential) -> dict:
    return {
        "id": credential.id,
        "kind": credential.kind,
        "name": credential.name,
        "scopes": sorted(credential.scopes),
        "created_at": credential.created_at,
        "expires_at": credential.expires_at,
        "last_used_at": credential.last_used_at,
    }


@router.post("/pairing-codes", summary="Create a short-lived pairing code")
async def create_pairing_code(request: Request):
    if not request.state.is_loopback:
        raise HTTPException(status_code=403, detail="Pairing codes can be created only on the Vox Mac.")
    code = _store(request).create_pairing_code()
    return {"code": code.value, "expires_at": code.expires_at}


@router.post("/pair", summary="Pair this browser")
async def pair_device(payload: PairRequest, request: Request, response: Response):
    client_id = request.client.host if request.client else "unknown"
    session = _store(request).redeem_pairing_code(
        payload.code,
        payload.device_name,
        client_id=client_id,
    )
    if session is None:
        raise HTTPException(status_code=400, detail="Pairing code is invalid, expired, used, or temporarily rate-limited.")
    response.set_cookie(
        "vox_session",
        session.secret,
        max_age=30 * 24 * 60 * 60,
        httponly=True,
        samesite="strict",
        secure=False,
        path="/",
    )
    return {
        "paired": True,
        "credential": {
            "id": session.id,
            "name": session.name,
            "scopes": sorted(session.scopes),
            "expires_at": session.expires_at,
        },
        "transport_warning": "Vox LAN access uses HTTP unless you provide trusted TLS. Use credentials only on a trusted LAN.",
    }


@router.get("/credentials", summary="List paired devices and API tokens")
async def list_credentials(request: Request):
    return [_credential_payload(item) for item in _store(request).list_credentials()]


@router.post("/tokens", summary="Create an API token")
async def create_token(payload: TokenRequest, request: Request):
    try:
        token = _store(request).create_api_token(
            payload.name,
            payload.scopes,
            ttl_seconds=payload.ttl_days * 86400 if payload.ttl_days else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        "id": token.id,
        "token": token.secret,
        "name": token.name,
        "scopes": sorted(token.scopes),
        "expires_at": token.expires_at,
        "notice": "Copy this token now. Vox stores only its hash and cannot show it again.",
    }


@router.delete("/credentials/{credential_id}", summary="Revoke a paired device or token")
async def revoke_credential(credential_id: str, request: Request):
    if not _store(request).revoke_credential(credential_id):
        raise HTTPException(status_code=404, detail="Credential not found.")
    return {"revoked": True, "id": credential_id}


@router.post("/revoke-all", summary="Revoke every remote credential")
async def revoke_all_credentials(request: Request):
    return {"revoked": _store(request).revoke_all_remote_credentials()}


def pairing_page(message: str = "") -> HTMLResponse:
    safe_message = escape(message)
    return HTMLResponse(
        f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pair with Vox</title>
  <style>
    :root {{ color-scheme: light dark; font-family: ui-sans-serif, -apple-system, sans-serif; }}
    body {{ margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f4f1; color: #171715; }}
    main {{ width: min(28rem, calc(100% - 2rem)); padding: 2rem; border: 1px solid #d8d8d2; border-radius: 1rem; background: white; box-shadow: 0 1rem 3rem #0001; }}
    h1 {{ margin-top: 0; }} label {{ display: block; margin-top: 1rem; font-weight: 650; }}
    input, button {{ box-sizing: border-box; width: 100%; min-height: 2.75rem; margin-top: .4rem; border-radius: .6rem; border: 1px solid #b8b8b1; padding: .65rem .8rem; font: inherit; }}
    button {{ margin-top: 1.25rem; border: 0; background: #171715; color: white; font-weight: 700; cursor: pointer; }}
    p {{ line-height: 1.5; color: #5f5f59; }} #message {{ color: #a33; }}
  </style>
</head>
<body><main>
  <h1>Pair with Vox</h1>
  <p>Enter the one-time code shown by Vox Helper on the Mac running Vox.</p>
  <form id="pair-form">
    <label for="device">Device name</label><input id="device" maxlength="80" required autocomplete="name">
    <label for="code">Pairing code</label><input id="code" maxlength="16" required inputmode="numeric" autocomplete="one-time-code">
    <button type="submit">Pair device</button>
  </form>
  <p id="message" role="alert">{safe_message}</p>
  <p>LAN transport is HTTP unless your network provides trusted TLS. Pair only on a network you trust.</p>
  <script>
    document.getElementById('pair-form').addEventListener('submit', async (event) => {{
      event.preventDefault();
      const response = await fetch('/api/v1/auth/pair', {{
        method: 'POST', headers: {{'Content-Type': 'application/json'}},
        body: JSON.stringify({{device_name: document.getElementById('device').value, code: document.getElementById('code').value}})
      }});
      if (response.ok) window.location.assign('/app');
      else document.getElementById('message').textContent = 'Pairing failed. Check the code and try again.';
    }});
  </script>
</main></body></html>"""
    )
