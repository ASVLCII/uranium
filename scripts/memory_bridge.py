"""JSON stdin boundary to the pinned Uranium/OMH memory engine. No Hermes startup."""
from __future__ import annotations

import json
import getpass
import sys
from pathlib import Path
from contextlib import redirect_stdout
import io
import hashlib
import os
import shutil
import tempfile
import zipfile
import time
import errno

ENGINE_SHA256 = "0c52f6916f08b30a18acfc00258bc17c6293e5e8a04b44d06bb740f8eeb1e77c"


def load_engine(cache: Path, *, unpack: bool = False) -> None:
    """Use the hash-pinned, bundled pure-Python engine, never an ambient OMH install."""
    if sys.version_info < (3, 11):
        raise RuntimeError("Uranium requires Python 3.11 or newer")
    wheel = Path(__file__).resolve().parents[1] / "engine" / "oh_my_hermes-4.0.3+uranium.3-py3-none-any.whl"
    if hashlib.sha256(wheel.read_bytes()).hexdigest() != ENGINE_SHA256:
        raise RuntimeError("Bundled memory engine checksum mismatch")
    if not unpack:
        sys.path.insert(0, str(wheel))
        return
    # Keep short Windows aliases: resolving packaged-app redirects can expand a
    # normal AppData path beyond the import loader's legacy path limit.
    cache = Path(os.path.abspath(cache.expanduser()))
    target = cache / ENGINE_SHA256
    marker = target / ".complete"
    lock = cache / (ENGINE_SHA256 + ".lock")
    if not marker.exists() or lock.exists():
        cache.mkdir(parents=True, exist_ok=True)
        deadline = time.monotonic() + 50
        while True:
            try:
                lock.mkdir()
                break
            except FileExistsError:
                # A bridge request is bounded to 60 seconds; a two-minute lease
                # lets a later request recover after a killed initializer.
                try:
                    if time.time() - lock.stat().st_mtime > 120:
                        lock.rmdir()
                        continue
                except FileNotFoundError:
                    continue
                if time.monotonic() >= deadline:
                    raise RuntimeError("Memory engine cache initialization is busy; retry shortly")
                time.sleep(0.05)
        temporary = None
        try:
            if marker.exists():
                sys.path.insert(0, str(target))
                return
            temporary = Path(tempfile.mkdtemp(prefix="extract-", dir=cache))
            with zipfile.ZipFile(wheel) as archive:
                for member in archive.infolist():
                    name = member.filename.replace("\\", "/")
                    if name.startswith("/") or ":" in name or ".." in name.split("/"):
                        raise RuntimeError("Unsafe memory engine archive entry")
                archive.extractall(temporary)
            if target.exists():
                if target.is_symlink():
                    raise RuntimeError("Refusing linked memory engine cache")
                shutil.rmtree(target)
            try:
                os.rename(temporary, target)
            except OSError as exc:
                if exc.errno != errno.EXDEV and getattr(exc, "winerror", None) != 17:
                    raise
                # Some Windows redirected folders cannot rename directories.
                # All readers wait on the lock until this copy is complete.
                shutil.copytree(temporary, target)
            marker.write_text(ENGINE_SHA256, encoding="ascii")
        finally:
            if temporary is not None and temporary.exists():
                shutil.rmtree(temporary)
            lock.rmdir()
    if marker.read_text(encoding="ascii") != ENGINE_SHA256:
        raise RuntimeError("Memory engine cache is incomplete")
    sys.path.insert(0, str(target))


def main(request: dict) -> dict:
    load_engine(Path(request.get("engineCache", str(Path(request["home"]) / "engine"))), unpack=request.get("operation") == "native")
    from omh.memory import (
        approve_project_memory_candidate, build_project_memory_recall_pack,
        build_project_memory_review, capture_project_memory_candidate, reject_project_memory_candidate,
    )
    from omh.plugin_bundle.omh.memory_principals import build_principal_context
    from omh.system.paths import OmhPaths

    home = Path(request["home"])
    paths = OmhPaths(home, home / "unused-hermes")
    operation = request["operation"]
    session = str(request.get("session", "operator"))
    scope = request.get("scope", "project")
    if scope not in ("project", "user"):
        raise ValueError("unsupported memory scope")
    principal = build_principal_context(
        home, profile_ref="uranium-local", surface_ref="local-console",
        session_ref=session, turn_ref="memory", actor_kind="human", host_identity=getpass.getuser(),
    ) if scope == "user" else None
    ref = principal["principal"] if principal else request["project"]
    if operation == "native":
        from omh.commands.main import main as memory_cli
        # Operator CLI only: expose the full existing lifecycle/consolidation API.
        arguments = request.get("arguments", [])
        if not isinstance(arguments, list) or not all(isinstance(value, str) for value in arguments):
            raise ValueError("native arguments must be strings")
        if arguments and arguments[0] in ("capture", "recall"):
            raise ValueError("Use Uranium memory capture/recall so project scope and personal identity remain bound to OpenCode")
        with redirect_stdout(io.StringIO()) as output:
            try:
                code = memory_cli(["--omh-home", str(home), "--hermes-home", str(home / "unused-hermes"), "memory", *arguments])
            except SystemExit as exc:
                code = exc.code or 0
        text = output.getvalue()
        try:
            result = json.loads(text)
        except ValueError:
            result = {"message": text[:20000]}
        return {"exitCode": code, "result": result}
    if operation == "capture":
        summary = str(request["summary"])
        if not 1 <= len(summary.strip()) <= 3000:
            raise ValueError("memory summaries must contain 1 to 3000 characters")
        return capture_project_memory_candidate(
            paths, summary, record_type=request.get("type", "fact"),
            scope_kind=scope, scope_ref=ref, source="opencode-uranium",
            source_ref=str(request.get("source", "")), force_review=True,
            ttl_days=request.get("ttlDays"), stale_after_days=request.get("staleDays", 90),
            principal_context=principal, executor_perspective="opencode",
        )
    if operation == "recall":
        return build_project_memory_recall_pack(
            paths, str(request.get("query", ""))[:12000],
            executor_target="opencode", session_id=session,
            allowed_scopes=[{"kind": scope, "ref": ref}],
            required_scope_kinds=(scope,), inspection=False,
            limit=6, max_chars=2500, principal_context=principal,
        )
    if operation == "review":
        return build_project_memory_review(paths, candidate_id=request.get("id"), limit=30)
    if operation in ("approve", "reject"):
        revision = request.get("revision", "")
        if not revision:
            raise ValueError("read the review card and provide its review_revision")
        if operation == "approve":
            return approve_project_memory_candidate(
                paths, request["id"], expected_revision=revision,
                approved_by="local-operator", reviewer_principal=principal["principal"] if principal else None,
            )
        return reject_project_memory_candidate(
            paths, request["id"], expected_revision=revision,
            rejected_by="local-operator", reason=str(request.get("reason", "operator decision")),
        )
    raise ValueError("unsupported memory operation")


if __name__ == "__main__":
    try:
        raw = sys.stdin.buffer.read(65537)
        if len(raw) > 65536:
            raise ValueError("memory request too large")
        print(json.dumps({"ok": True, "result": main(json.loads(raw))}, ensure_ascii=False))
    except Exception as exc:
        # The caller receives a bounded error; never dump raw requests or stack locals.
        print(json.dumps({"ok": False, "error": type(exc).__name__, "message": str(exc)[:500]}))
        sys.exit(1)
