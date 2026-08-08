#!/usr/bin/env python3
"""
Heritage Ecosystem process manager — start / stop / restart / status.

Core (default): App :8175, Local RAG :8176, Clustering :8177
Optional:     --with-webgl :8179, --with-api-fallback :8178

Usage (from repo root):
  python scripts/start_all.py              # start (default)
  python scripts/start_all.py --start
  python scripts/start_all.py --stop
  python scripts/start_all.py --restart
  python scripts/start_all.py --status
  python scripts/start_all.py --build-frontend
  python scripts/start_all.py --with-webgl
  python scripts/start_all.py --with-api-fallback
"""

from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IS_WIN = sys.platform.startswith("win")
PID_FILE = ROOT / "scripts" / ".heritage_pids.json"

# Canonical ports for this project
PORTS = {
    "application": 8175,
    "local-rag": 8176,
    "clustering": 8177,
    "fallback": 8178,
    "webgl": 8179,
}


def _npm() -> str:
    return "npm.cmd" if IS_WIN else "npm"


def _npx() -> str:
    return "npx.cmd" if IS_WIN else "npx"


def ensure_frontend_build(force: bool = False) -> None:
    build_index = ROOT / "Application" / "frontend" / "build" / "index.html"
    if build_index.exists() and not force:
        print("[ok] Frontend build present")
        return
    print("[build] Building React frontend...")
    subprocess.check_call(
        [_npm(), "run", "build"],
        cwd=str(ROOT / "Application" / "frontend"),
        shell=IS_WIN,
    )


def pids_listening_on(port: int) -> list[int]:
    """Return PIDs that have a LISTEN socket on port."""
    pids: set[int] = set()
    try:
        if IS_WIN:
            out = subprocess.check_output(
                ["netstat", "-ano", "-p", "tcp"],
                text=True,
                errors="ignore",
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            needle = f":{port} "
            for line in out.splitlines():
                if "LISTENING" not in line.upper() and "LISTEN" not in line.upper():
                    continue
                if needle not in line and not line.rstrip().endswith(f":{port}"):
                    # also match 0.0.0.0:8177 or [::]:8177
                    if f":{port}" not in line:
                        continue
                parts = line.split()
                if not parts:
                    continue
                try:
                    pid = int(parts[-1])
                    if pid > 0:
                        pids.add(pid)
                except ValueError:
                    continue
        else:
            try:
                out = subprocess.check_output(
                    ["lsof", "-ti", f"TCP:{port}", "-sTCP:LISTEN"],
                    text=True,
                    errors="ignore",
                )
                for tok in out.split():
                    pids.add(int(tok))
            except (subprocess.CalledProcessError, FileNotFoundError):
                out = subprocess.check_output(
                    ["ss", "-ltnp"], text=True, errors="ignore"
                )
                import re

                for line in out.splitlines():
                    if f":{port} " not in line and not line.endswith(f":{port}"):
                        continue
                    for m in re.finditer(r"pid=(\d+)", line):
                        pids.add(int(m.group(1)))
    except Exception as e:
        print(f"[warn] port scan {port}: {e}")
    return sorted(pids)


def kill_pid(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        if IS_WIN:
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(pid)],
                capture_output=True,
                text=True,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
        else:
            os.kill(pid, signal.SIGTERM)
            time.sleep(0.4)
            try:
                os.kill(pid, 0)
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        return True
    except Exception as e:
        print(f"[warn] kill {pid}: {e}")
        return False


def load_pid_file() -> dict:
    if not PID_FILE.exists():
        return {}
    try:
        return json.loads(PID_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_pid_file(data: dict) -> None:
    PID_FILE.parent.mkdir(parents=True, exist_ok=True)
    PID_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def clear_pid_file() -> None:
    if PID_FILE.exists():
        PID_FILE.unlink()


def cmd_status() -> int:
    print("=== Heritage service status ===")
    any_up = False
    for name, port in PORTS.items():
        pids = pids_listening_on(port)
        if pids:
            any_up = True
            print(f"  {name:12} :{port}  UP   pids={pids}")
        else:
            print(f"  {name:12} :{port}  down")
    tracked = load_pid_file()
    if tracked.get("services"):
        print(f"  pidfile: {PID_FILE.name} ({len(tracked['services'])} entries)")
    return 0 if any_up else 1


def cmd_stop() -> int:
    print("[stop] Stopping Heritage services…")
    killed: set[int] = set()

    tracked = load_pid_file()
    for svc in tracked.get("services") or []:
        pid = int(svc.get("pid") or 0)
        name = svc.get("name", "?")
        if pid and kill_pid(pid):
            print(f"  stopped {name} (pid {pid})")
            killed.add(pid)

    # Always clear listeners on our ports (covers shell=True orphan children)
    for name, port in PORTS.items():
        for pid in pids_listening_on(port):
            if pid in killed:
                continue
            if kill_pid(pid):
                print(f"  freed :{port} ({name}) pid {pid}")
                killed.add(pid)

    clear_pid_file()
    time.sleep(0.5)
    still = []
    for name, port in PORTS.items():
        if pids_listening_on(port):
            still.append(f"{name}:{port}")
    if still:
        print(f"[warn] still listening: {', '.join(still)}")
        return 1
    print("[ok] All Heritage ports free")
    return 0


def spawn(name: str, cmd: list[str], cwd: Path) -> subprocess.Popen:
    print(f"[start] {name}: {' '.join(cmd)}  (cwd={cwd})")
    # Avoid shell=True so Popen.pid is the real process (esp. important for --stop)
    kwargs: dict = {
        "cwd": str(cwd),
        "env": os.environ.copy(),
    }
    if IS_WIN:
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]
    return subprocess.Popen(cmd, **kwargs)


def cmd_start(args: argparse.Namespace) -> int:
    # Don't double-bind ports
    busy = {n: pids_listening_on(p) for n, p in PORTS.items() if pids_listening_on(p)}
    core_busy = {k: v for k, v in busy.items() if k in ("application", "local-rag", "clustering")}
    if core_busy and not args.force:
        print("[warn] Some services already running:")
        for n, pids in core_busy.items():
            print(f"  {n} :{PORTS[n]} pids={pids}")
        print("  Use --stop first, or --restart, or --force to start anyway.")
        return 1

    ensure_frontend_build(force=args.build_frontend)

    procs: list[tuple[str, subprocess.Popen, int]] = []

    def track(name: str, p: subprocess.Popen, port: int) -> None:
        procs.append((name, p, port))

    track(
        "application",
        spawn(
            "Application (API+UI)",
            ["node", "index.js"],
            ROOT / "Application" / "backend" / "server",
        ),
        PORTS["application"],
    )

    if not args.no_clustering:
        track(
            "clustering",
            spawn("Clustering API", [sys.executable, "app.py"], ROOT / "Clustering"),
            PORTS["clustering"],
        )

    if not args.no_agent:
        local_rag = ROOT / "Chatbot" / "Local-RAG"
        if (local_rag / "app.py").exists():
            track(
                "local-rag",
                spawn("Local RAG Chatbot", [sys.executable, "app.py"], local_rag),
                PORTS["local-rag"],
            )
        else:
            agent_dir = ROOT / "Chatbot" / "Agent-Based"
            build_js = agent_dir / "build" / "server.js"
            if not build_js.exists():
                print("[build] Compiling Agent-Based chatbot (tsc)...")
                try:
                    subprocess.check_call(
                        [_npm(), "run", "build"],
                        cwd=str(agent_dir),
                        shell=IS_WIN,
                    )
                except subprocess.CalledProcessError:
                    print("[warn] Agent build failed — skipping")
                    build_js = None
            if build_js and build_js.exists():
                track(
                    "agent",
                    spawn("Agent Chatbot", ["node", "build/server.js"], agent_dir),
                    PORTS["local-rag"],
                )

    if args.with_api_fallback:
        # Api-Based reads PORT from its own .env; we don't force 8178 here
        track(
            "fallback",
            spawn(
                "Fallback Chatbot",
                [sys.executable, "app.py"],
                ROOT / "Chatbot" / "Api-Based",
            ),
            PORTS["fallback"],
        )
    else:
        print("[skip] Api-Based (pass --with-api-fallback)")

    if args.with_webgl and not args.no_webgl:
        webgl = ROOT / "WebGLBuilds"
        if webgl.exists():
            track(
                "webgl",
                spawn(
                    "WebGL static",
                    [_npx(), "--yes", "serve", "-p", str(PORTS["webgl"]), "--cors"],
                    webgl,
                ),
                PORTS["webgl"],
            )
        else:
            print("[warn] WebGLBuilds/ not found")
    else:
        print("[skip] WebGL (REACT_APP_SIM_URL; pass --with-webgl)")

    save_pid_file(
        {
            "started_at": time.time(),
            "services": [
                {"name": name, "pid": p.pid, "port": port} for name, p, port in procs
            ],
        }
    )

    print("\n=== Heritage Ecosystem running ===")
    print(f"  UI + API:      http://localhost:{PORTS['application']}")
    print(f"  Clustering:    http://localhost:{PORTS['clustering']}")
    print(f"  Local RAG:     http://localhost:{PORTS['local-rag']}")
    print("  WebGL / Api-Based: only if you passed the flags")
    print("  Stop:  python scripts/start_all.py --stop")
    print("  Or:    Ctrl+C in this window\n")

    def shutdown(*_a):
        print("\n[stop] Shutting down (Ctrl+C)…")
        for name, p, _port in procs:
            if p.poll() is None:
                try:
                    if IS_WIN:
                        subprocess.run(
                            ["taskkill", "/F", "/T", "/PID", str(p.pid)],
                            capture_output=True,
                        )
                    else:
                        p.terminate()
                except Exception:
                    pass
                print(f"  stopped {name}")
        for _name, p, _port in procs:
            try:
                p.wait(timeout=5)
            except Exception:
                try:
                    p.kill()
                except Exception:
                    pass
        # Port sweep for orphans
        for name, port in PORTS.items():
            for pid in pids_listening_on(port):
                kill_pid(pid)
        clear_pid_file()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, shutdown)

    try:
        while True:
            for name, p, _port in procs:
                code = p.poll()
                if code is not None and code != 0:
                    print(f"[exit] {name} exited with code {code}")
            time.sleep(2)
    except KeyboardInterrupt:
        shutdown()

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Heritage start/stop/restart manager",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Default action is --start if none of --stop/--restart/--status is given.",
    )
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--start", action="store_true", help="Start services (default)")
    action.add_argument("--stop", action="store_true", help="Stop all Heritage services")
    action.add_argument("--restart", action="store_true", help="Stop then start")
    action.add_argument("--status", action="store_true", help="Show port / PID status")

    parser.add_argument("--build-frontend", action="store_true")
    parser.add_argument("--with-webgl", action="store_true")
    parser.add_argument("--no-webgl", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--no-agent", action="store_true")
    parser.add_argument("--with-api-fallback", action="store_true")
    parser.add_argument("--no-clustering", action="store_true")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Start even if ports look busy",
    )
    args = parser.parse_args()

    if args.stop:
        return cmd_stop()
    if args.status:
        return cmd_status()
    if args.restart:
        cmd_stop()
        time.sleep(1)
        return cmd_start(args)
    # default start
    return cmd_start(args)


if __name__ == "__main__":
    raise SystemExit(main())
