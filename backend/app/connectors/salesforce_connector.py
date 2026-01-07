from __future__ import annotations

import json
import time
from threading import RLock
from typing import Any, Dict, Generator, List, Optional

import pandas as pd

from .base import BaseConnector


_CACHE_LOCK = RLock()
_CACHE: Dict[str, tuple[float, Any]] = {}


def _cache_get(key: str) -> Optional[Any]:
    now = time.time()
    with _CACHE_LOCK:
        item = _CACHE.get(key)
        if not item:
            return None
        expires_at, value = item
        if expires_at <= now:
            _CACHE.pop(key, None)
            return None
        return value


def _cache_set(key: str, value: Any, ttl_seconds: int) -> None:
    with _CACHE_LOCK:
        _CACHE[key] = (time.time() + float(ttl_seconds), value)


class SalesforceConnector(BaseConnector):
    """Salesforce connector.

        Supports two auth modes:
        - OAuth (recommended): access_token (session_id) + instance_url, optionally refresh_token
            to obtain fresh access tokens via OAuth token endpoint (no SOAP login).
        - Legacy: username + password + security token (SOAP login under the hood; often disabled).

        This connector is intentionally scoped to:
        - list objects
        - describe object fields
        - query object rows (chunked) into DataFrames
    """

    def __init__(
        self,
        username: Optional[str] = None,
        password: Optional[str] = None,
        security_token: Optional[str] = None,
        object_name: Optional[str] = None,
        fields: Optional[List[str]] = None,
        login_domain: str = "login",
        api_version: Optional[str] = None,
        chunk_size: int = 10000,
        auth_type: str = "password",
        access_token: Optional[str] = None,
        refresh_token: Optional[str] = None,
        instance_url: Optional[str] = None,
        auth_base_url: Optional[str] = None,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        **kwargs,
    ):
        # BaseConnector expects a connection_string; not meaningful for SF
        super().__init__(connection_string="salesforce", **kwargs)
        self.username = username
        self.password = password
        self.security_token = security_token
        self.object_name = object_name
        self.fields = fields or []
        self.login_domain = login_domain or "login"
        self.api_version = api_version
        self.chunk_size = int(chunk_size) if chunk_size else 10000

        self.auth_type = (auth_type or "password").strip().lower()
        self.access_token = access_token
        self.refresh_token = refresh_token
        self.instance_url = instance_url
        self.auth_base_url = auth_base_url
        self.client_id = client_id
        self.client_secret = client_secret

        self._sf = None
        self.last_error: Optional[str] = None
        self._cache_ns: Optional[str] = None

    def _resolve_oauth_client(self) -> Dict[str, str]:
        """Resolve OAuth client configuration.

        Client ID/secret are typically configured on the backend via env vars.
        """
        client_id = (self.client_id or "").strip()
        client_secret = (self.client_secret or "").strip()
        if not client_id or not client_secret:
            try:
                from ..config import settings

                client_id = client_id or (settings.SALESFORCE_CLIENT_ID or "").strip()
                client_secret = client_secret or (settings.SALESFORCE_CLIENT_SECRET or "").strip()
            except Exception:
                pass
        return {"client_id": client_id, "client_secret": client_secret}

    def _resolve_auth_base_url(self) -> str:
        base = (self.auth_base_url or "").strip()
        if not base:
            try:
                from ..config import settings

                base = (settings.SALESFORCE_AUTH_BASE_URL or "").strip()
            except Exception:
                base = ""
        base = base or "https://login.salesforce.com"
        base = base.rstrip("/")
        if not base.startswith("http://") and not base.startswith("https://"):
            base = "https://" + base
        return base

    def refresh_access_token(self) -> str:
        """Use refresh_token grant to obtain a fresh access token.

        Updates self.access_token and self.instance_url and returns the new access token.
        """
        if not self.refresh_token:
            raise ValueError("refresh_token is required")

        client = self._resolve_oauth_client()
        if not client.get("client_id") or not client.get("client_secret"):
            raise ValueError("Salesforce OAuth client not configured (client_id/client_secret missing)")

        import httpx

        token_url = f"{self._resolve_auth_base_url()}/services/oauth2/token"
        data = {
            "grant_type": "refresh_token",
            "client_id": client["client_id"],
            "client_secret": client["client_secret"],
            "refresh_token": self.refresh_token,
        }
        resp = httpx.post(token_url, data=data, timeout=30)
        if resp.status_code >= 400:
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text
            raise RuntimeError(f"Salesforce refresh_token exchange failed: {detail}")

        token = resp.json() if resp.content else {}
        access_token = token.get("access_token")
        instance_url = token.get("instance_url")
        if not access_token:
            raise RuntimeError("Salesforce refresh_token exchange did not return access_token")

        self.access_token = access_token
        if instance_url:
            self.instance_url = instance_url
        return access_token

    def connect(self) -> bool:
        try:
            from simple_salesforce import Salesforce

            # OAuth: use access_token + instance_url, optionally refresh_token
            if self.auth_type == "oauth" or self.refresh_token or (self.access_token and self.instance_url):
                if self.refresh_token:
                    # Always refresh in this mode so long-running syncs don't fail mid-run.
                    self.refresh_access_token()

                if not self.access_token or not self.instance_url:
                    raise ValueError("OAuth requires access_token and instance_url (or refresh_token)")

                kwargs: Dict[str, Any] = {
                    "instance_url": self.instance_url,
                    "session_id": self.access_token,
                }
                if self.api_version:
                    kwargs["version"] = self.api_version
                self._sf = Salesforce(**kwargs)
            else:
                # Legacy username/password/token (SOAP login)
                if not self.username or not self.password or not self.security_token:
                    raise ValueError("username, password, and security_token are required")

                kwargs = {
                    "username": self.username,
                    "password": self.password,
                    "security_token": self.security_token,
                    "domain": self.login_domain,
                }
                if self.api_version:
                    kwargs["version"] = self.api_version
                self._sf = Salesforce(**kwargs)

            # Namespace for caching describe/metadata calls.
            self._cache_ns = (
                getattr(self._sf, "base_url", None)
                or self.instance_url
                or ("test" if (self.login_domain or "login").strip().lower() == "test" else "login")
            )

            self.is_connected = True
            self.last_error = None
            return True
        except Exception as e:
            self._sf = None
            self.is_connected = False
            self.last_error = str(e)
            return False

    def test_connection(self) -> Dict[str, Any]:
        """Test connection with a more helpful error message than BaseConnector."""
        try:
            ok = self.connect()
            if ok:
                self.disconnect()
                return {"success": True, "message": "Connection successful"}

            msg = self.last_error or "Connection failed"
            # Common SF failure: sandbox vs prod (legacy)
            if "INVALID_LOGIN" in msg and (self.login_domain or "") == "login":
                msg = f"{msg} (If this is a Sandbox, set login_domain to 'test')"
            return {"success": False, "message": msg}
        except Exception as e:
            return {"success": False, "message": f"Connection error: {str(e)}"}

    def disconnect(self) -> bool:
        self._sf = None
        self.is_connected = False
        return True

    def _require_connected(self) -> None:
        if not self._sf:
            raise RuntimeError("Salesforce connector is not connected")

    def _cache_key(self, kind: str, object_name: Optional[str] = None) -> str:
        ns = self._cache_ns or self.instance_url or "salesforce"
        ver = self.api_version or ""
        obj = object_name or ""
        return f"sf:{ns}:v={ver}:{kind}:{obj}"

    def _extract_error_code(self, exc: Exception) -> Optional[str]:
        content = getattr(exc, "content", None)
        data: Any = None
        if isinstance(content, (dict, list)):
            data = content
        elif isinstance(content, (bytes, str)):
            try:
                s = content.decode("utf-8") if isinstance(content, bytes) else content
                data = json.loads(s)
            except Exception:
                data = None

        if data is None:
            # Fallback: sometimes the exception string contains the JSON.
            try:
                data = json.loads(str(exc))
            except Exception:
                data = None

        if isinstance(data, list) and data:
            first = data[0]
            if isinstance(first, dict):
                return first.get("errorCode") or first.get("error_code")
        if isinstance(data, dict):
            return data.get("errorCode") or data.get("error_code")
        return None

    def _raise_friendly_salesforce_error(self, exc: Exception) -> None:
        code = self._extract_error_code(exc)
        if code == "REQUEST_LIMIT_EXCEEDED":
            raise RuntimeError(
                "Salesforce API request limit exceeded (REQUEST_LIMIT_EXCEEDED). "
                "This org/user has hit its API quota. Wait for the quota to reset or reduce calls (cache objects/fields, avoid repeated tests)."
            ) from exc

    def _describe_cached(self, ttl_seconds: int = 300) -> Dict[str, Any]:
        self._require_connected()
        key = self._cache_key("describe")
        cached = _cache_get(key)
        if isinstance(cached, dict):
            return cached
        try:
            d = self._sf.describe() or {}
        except Exception as e:
            self._raise_friendly_salesforce_error(e)
            raise
        _cache_set(key, d, ttl_seconds)
        return d

    def _describe_object_cached(self, object_name: str, ttl_seconds: int = 300) -> Dict[str, Any]:
        self._require_connected()
        key = self._cache_key("obj_describe", object_name)
        cached = _cache_get(key)
        if isinstance(cached, dict):
            return cached
        try:
            desc = getattr(self._sf, object_name).describe() or {}
        except Exception as e:
            self._raise_friendly_salesforce_error(e)
            raise
        _cache_set(key, desc, ttl_seconds)
        return desc

    def validate_source(self) -> Dict[str, Any]:
        try:
            self._require_connected()
            if self.object_name:
                # Verify object is describable
                _ = self._describe_object_cached(self.object_name, ttl_seconds=300)
            return {"is_valid": True, "errors": [], "warnings": []}
        except Exception as e:
            return {"is_valid": False, "errors": [str(e)], "warnings": []}

    def list_objects(self) -> List[str]:
        self._require_connected()
        d = self._describe_cached(ttl_seconds=300)
        sobjects = d.get("sobjects") or []
        out: List[str] = []
        for o in sobjects:
            try:
                if o.get("deprecatedAndHidden"):
                    continue
                # prefer queryable objects
                if o.get("queryable") is False:
                    continue
                name = o.get("name")
                if name:
                    out.append(str(name))
            except Exception:
                continue
        return sorted(list(set(out)))

    def describe_object_fields(self, object_name: str) -> List[Dict[str, Any]]:
        self._require_connected()
        desc = self._describe_object_cached(object_name, ttl_seconds=300)
        fields = desc.get("fields") or []
        out: List[Dict[str, Any]] = []
        for f in fields:
            name = f.get("name")
            if not name:
                continue
            out.append(
                {
                    "name": str(name),
                    "label": f.get("label"),
                    "type": f.get("type"),
                    "nillable": f.get("nillable"),
                    "custom": f.get("custom"),
                }
            )
        return out

    def _build_soql(self, limit: Optional[int] = None) -> str:
        if not self.object_name:
            raise ValueError("object_name is required")
        fields = self.fields or ["Id"]
        # Safety: SOQL has practical limits; keep selection reasonable.
        if len(fields) > 200:
            raise ValueError("Too many fields selected (max 200). Please select fewer fields.")
        field_list = ", ".join(fields)
        soql = f"SELECT {field_list} FROM {self.object_name}"
        if limit is not None:
            soql += f" LIMIT {int(limit)}"
        return soql

    def get_schema(self) -> Dict[str, Any]:
        self._require_connected()
        if not self.object_name:
            return {"columns": [], "column_count": 0, "row_count": 0}

        # Columns from describe so we return stable names/types
        described = self.describe_object_fields(self.object_name)
        described_map = {f["name"]: f for f in described if isinstance(f, dict) and f.get("name")}
        selected = self.fields or list(described_map.keys())
        columns = []
        for name in selected:
            meta = described_map.get(name, {})
            columns.append({"name": name, "type": meta.get("type")})

        row_count: Optional[int] = None
        try:
            res = self._sf.query(f"SELECT COUNT() FROM {self.object_name}")
            row_count = int(res.get("totalSize")) if isinstance(res, dict) else None
        except Exception:
            row_count = None

        return {
            "columns": columns,
            "column_count": len(columns),
            "row_count": row_count,
        }

    def fetch_data(self, limit: Optional[int] = None, offset: int = 0) -> pd.DataFrame:
        """Fetch a small preview.

        Salesforce SOQL OFFSET has a 2,000 row maximum and is inefficient for large offsets.
        For UI preview, we support offset by skipping records from query_all_iter.
        """
        self._require_connected()
        soql = self._build_soql(limit=None)
        it = self._sf.query_all_iter(soql)
        # skip offset
        skipped = 0
        while offset and skipped < int(offset):
            try:
                next(it)
                skipped += 1
            except StopIteration:
                break

        rows: List[Dict[str, Any]] = []
        take = int(limit) if limit is not None else 200
        for _ in range(take):
            try:
                r = next(it)
            except StopIteration:
                break
            if isinstance(r, dict) and "attributes" in r:
                r = {k: v for k, v in r.items() if k != "attributes"}
            rows.append(r)

        return pd.DataFrame(rows)

    def fetch_data_chunked(self, chunk_size: int = 10000) -> Generator[pd.DataFrame, None, None]:
        self._require_connected()
        soql = self._build_soql(limit=None)
        size = int(chunk_size) if chunk_size else self.chunk_size
        buf: List[Dict[str, Any]] = []
        for r in self._sf.query_all_iter(soql):
            if isinstance(r, dict) and "attributes" in r:
                r = {k: v for k, v in r.items() if k != "attributes"}
            buf.append(r)
            if len(buf) >= size:
                yield pd.DataFrame(buf)
                buf = []
        if buf:
            yield pd.DataFrame(buf)

    def get_row_count(self) -> int:
        self._require_connected()
        if not self.object_name:
            return 0
        res = self._sf.query(f"SELECT COUNT() FROM {self.object_name}")
        return int(res.get("totalSize")) if isinstance(res, dict) else 0
