"""Package only the runtime assets declared by the Chrome manifest."""
import argparse
import json
from pathlib import Path
import zipfile


def main():
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=root / "artifacts")
    args = parser.parse_args()
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    patterns = ["manifest.json"]
    for script in manifest.get("content_scripts", []):
        patterns.extend(script.get("js", []) + script.get("css", []))
    worker = manifest.get("background", {}).get("service_worker")
    if worker:
        patterns.append(worker)
    patterns.extend(manifest.get("sandbox", {}).get("pages", []))
    for resources in manifest.get("web_accessible_resources", []):
        patterns.extend(resources.get("resources", []))
    patterns.extend(manifest.get("icons", {}).values())

    files = set()
    for pattern in patterns:
        relative = Path(pattern)
        if relative.is_absolute() or ".." in relative.parts or ".git" in relative.parts:
            raise ValueError(f"Invalid asset path: {pattern}")
        matches = [path for path in root.glob(pattern) if path.is_file()]
        if not matches:
            raise FileNotFoundError(f"Missing manifest asset: {pattern}")
        for path in matches:
            path.resolve().relative_to(root)
            files.add(path.relative_to(root).as_posix())

    args.output_dir.mkdir(parents=True, exist_ok=True)
    output = args.output_dir / f"better-deepseek-chrome-v{manifest['version']}.zip"
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in sorted(files):
            archive.write(root / name, name)
    with zipfile.ZipFile(output) as archive:
        if archive.testzip() is not None:
            raise ValueError("Archive integrity check failed")
        for name in files:
            if archive.read(name) != (root / name).read_bytes():
                raise ValueError(f"Archive differs from runtime asset: {name}")
    print(f"Verified {len(files)} runtime files: {output}")


if __name__ == "__main__":
    main()
