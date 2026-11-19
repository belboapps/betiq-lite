"""Checks Cloudflare Access's signed login pass (a JWT), using only the standard library.

Cloudflare sends it to the app in the Cf-Access-Jwt-Assertion header on every visit that has
passed the login. It is signed with RS256 by keys published at
https://<team>.cloudflareaccess.com/cdn-cgi/access/certs. A pass is accepted only when the
signature matches one of those keys, it was issued for this app (aud), by this team (iss),
and has not expired. A bare header without a valid signature is refused, so nobody on the
home network can pretend to be someone by sending a made-up header straight to the port.
"""
import base64
import hashlib
import json
import threading
import time
import urllib.request

CERTS_TTL = 3600
_cache = {}
_lock = threading.Lock()


def _b64(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _int(s):
    return int.from_bytes(_b64(s), "big")


# DER prefix of the DigestInfo for SHA-256 inside a PKCS#1 v1.5 signature.
_SHA256_PREFIX = bytes.fromhex("3031300d060960864801650304020105000420")


def rsa_verify(n, e, msg, sig):
    """PKCS#1 v1.5 RS256 signature check."""
    k = (n.bit_length() + 7) // 8
    if len(sig) != k:
        return False
    s = int.from_bytes(sig, "big")
    if s >= n:
        return False
    em = pow(s, e, n).to_bytes(k, "big")
    want = b"\x00\x01" + b"\xff" * (k - 3 - len(_SHA256_PREFIX) - 32) + b"\x00" + _SHA256_PREFIX + hashlib.sha256(msg).digest()
    return len(want) == k and em == want


def certs(team, fetch=None):
    """The team's public keys by key id, cached for an hour."""
    with _lock:
        hit = _cache.get(team)
        if hit and time.time() - hit[0] < CERTS_TTL:
            return hit[1]
    if fetch:
        data = fetch(team)
    else:
        req = urllib.request.Request(f"https://{team}/cdn-cgi/access/certs", headers={"User-Agent": "home-dashboard"})
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.load(r)
    keys = {k["kid"]: (_int(k["n"]), _int(k["e"])) for k in data.get("keys", []) if k.get("kty") == "RSA"}
    with _lock:
        _cache[team] = (time.time(), keys)
    return keys


def verify(token, team, auds, now=None, fetch=None):
    """The signed-in email, or None. `auds` is the set of app tags this app accepts."""
    try:
        h64, p64, s64 = token.split(".")
        head, body = json.loads(_b64(h64)), json.loads(_b64(p64))
        if head.get("alg") != "RS256":
            return None
        keys = certs(team, fetch)
        if head.get("kid") not in keys:
            _cache.pop(team, None)             # keys may have been rotated: fetch once more
            keys = certs(team, fetch)
        key = keys.get(head.get("kid"))
        if not key or not rsa_verify(key[0], key[1], f"{h64}.{p64}".encode(), _b64(s64)):
            return None
        now = now or time.time()
        aud = body.get("aud")
        aud = aud if isinstance(aud, list) else [aud]
        if not set(aud) & set(auds):
            return None
        if body.get("iss") != f"https://{team}" or body.get("exp", 0) < now or body.get("nbf", 0) > now + 60:
            return None
        email = (body.get("email") or "").strip().lower()
        return email or None
    except Exception:
        return None
