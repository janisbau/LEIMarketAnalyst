"""
fetch_local.py — Bootstrap LEI market data locally (no GitHub Actions needed).

Usage (run from repo root):
    python scripts/fetch_local.py          # daily delta only (~0.5 MB download)
    python scripts/fetch_local.py --full   # delta + full Golden Copy (~450 MB)

Downloads GLEIF Golden Copy files, runs the processing scripts, writes JSON
data files to ./data/, then cleans up the raw downloads.

No third-party packages required — uses Python 3 standard library only.
"""

import os
import sys
import json
import shutil
import zipfile
import subprocess
import urllib.request

# ---- GLEIF Golden Copy API ----
PUBLISHES_API = 'https://goldencopy.gleif.org/api/v2/golden-copies/publishes'

# ---- Paths (relative to repo root) ----
DELTA_ZIP  = 'delta.zip'
FULL_ZIP   = 'full.zip'
DELTA_DIR  = 'delta'
FULL_DIR   = 'full'
DATA_DIR   = 'data'

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def log(msg):
    print(msg, flush=True)


def progress_hook(label):
    """Returns a reporthook for urllib that prints download progress."""
    def hook(block_num, block_size, total_size):
        downloaded = block_num * block_size
        if total_size > 0:
            mb_done  = downloaded / 1024 / 1024
            mb_total = total_size  / 1024 / 1024
            pct = min(100, downloaded * 100 // total_size)
            print(f'\r  {label}: {mb_done:.1f} MB / {mb_total:.1f} MB  [{pct}%]  ', end='', flush=True)
        else:
            mb_done = downloaded / 1024 / 1024
            print(f'\r  {label}: {mb_done:.1f} MB downloaded  ', end='', flush=True)
    return hook


def get_download_urls():
    """Fetch the latest publish metadata from GLEIF API and return (full_url, delta_url)."""
    log('[api] Fetching latest Golden Copy metadata...')
    try:
        req = urllib.request.Request(
            PUBLISHES_API,
            headers={'Accept': 'application/json', 'User-Agent': 'LEIMarketAnalyzer/1.0'}
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
    except Exception as e:
        log(f'ERROR: Could not reach GLEIF API — {e}')
        sys.exit(1)

    try:
        latest = data['data'][0]
        lei2 = latest['lei2']
        full_url  = lei2['full_file']['csv']['url']
        delta_url = lei2['delta_files']['LastDay']['csv']['url']
        pub_date  = latest.get('publish_date', 'unknown')
        log(f'  Latest publish: {pub_date}')
        return full_url, delta_url
    except (KeyError, IndexError, TypeError) as e:
        log(f'ERROR: Unexpected API response structure — {e}')
        log(f'  Response: {json.dumps(data)[:500]}')
        sys.exit(1)


def download(url, dest, label):
    """Download url to dest with progress output."""
    log(f'\n[download] {label}')
    log(f'  URL: {url}')
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'LEIMarketAnalyzer/1.0'})
        with urllib.request.urlopen(req) as resp:
            total = int(resp.headers.get('Content-Length', 0))
            with open(dest, 'wb') as f:
                block = 1024 * 64
                downloaded = 0
                while True:
                    chunk = resp.read(block)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    mb_done = downloaded / 1024 / 1024
                    if total:
                        mb_total = total / 1024 / 1024
                        pct = min(100, downloaded * 100 // total)
                        print(f'\r  {mb_done:.1f} / {mb_total:.1f} MB  [{pct}%]  ', end='', flush=True)
                    else:
                        print(f'\r  {mb_done:.1f} MB  ', end='', flush=True)
        print()
        size_mb = os.path.getsize(dest) / 1024 / 1024
        log(f'  Saved: {dest}  ({size_mb:.2f} MB)')
        return dest
    except Exception as e:
        print()
        log(f'ERROR: Download failed — {e}')
        sys.exit(1)


def unzip(zip_path, dest_dir):
    """Unzip zip_path into dest_dir."""
    if os.path.exists(dest_dir):
        shutil.rmtree(dest_dir)
    os.makedirs(dest_dir)
    log(f'[unzip] {zip_path} -> {dest_dir}/')
    with zipfile.ZipFile(zip_path, 'r') as zf:
        zf.extractall(dest_dir)
    for root, dirs, files in os.walk(dest_dir):
        for f in files:
            fpath = os.path.join(root, f)
            size_mb = os.path.getsize(fpath) / 1024 / 1024
            log(f'  {fpath}  ({size_mb:.1f} MB)')


def run_script(script_name):
    """Run a Python script from scripts/ with cwd = repo root."""
    script_path = os.path.join('scripts', script_name)
    log(f'\n[process] {script_path}')
    result = subprocess.run([sys.executable, script_path], cwd=REPO_ROOT)
    if result.returncode != 0:
        log(f'ERROR: {script_path} exited with code {result.returncode}')
        sys.exit(result.returncode)


def cleanup(*paths):
    for p in paths:
        if os.path.isfile(p):
            os.remove(p)
            log(f'[cleanup] {p}')
        elif os.path.isdir(p):
            shutil.rmtree(p)
            log(f'[cleanup] {p}/')


def print_summary(files):
    log('\n' + '=' * 60)
    log('Output files:')
    for f in files:
        path = os.path.join(DATA_DIR, f)
        if os.path.exists(path):
            size_kb = os.path.getsize(path) / 1024
            log(f'  {path:<48}  {size_kb:6.1f} KB')
        else:
            log(f'  {path:<48}  (not generated)')
    log('=' * 60)
    log('Done! Reload http://localhost:3001 to see updated data.')


def main():
    run_full = '--full' in sys.argv

    os.chdir(REPO_ROOT)
    os.makedirs(DATA_DIR, exist_ok=True)

    log('LEI Market — Local Data Bootstrap')
    log('=' * 60)

    full_url, delta_url = get_download_urls()

    # ---- Daily delta ----
    download(delta_url, DELTA_ZIP, 'Daily delta ZIP')
    unzip(DELTA_ZIP, DELTA_DIR)
    run_script('process_delta.py')
    cleanup(DELTA_ZIP, DELTA_DIR)

    delta_files = ['daily-stats.json', 'history.json']

    # ---- Full Golden Copy (optional) ----
    full_files = []
    if run_full:
        log('\n[full] Full Golden Copy (~450 MB, may take 5-15 minutes)...')
        download(full_url, FULL_ZIP, 'Full Golden Copy ZIP')
        unzip(FULL_ZIP, FULL_DIR)
        run_script('process_full.py')
        cleanup(FULL_ZIP, FULL_DIR)
        full_files = [
            'market-share.json',
            'market-share-history.json',
            'entity-types.json',
            'renewal-pipeline.json',
            'lou-home-countries.json',
        ]
    else:
        log('\n[info] Skipping full Golden Copy. Add --full flag to also get market share data.')

    print_summary(delta_files + full_files)


if __name__ == '__main__':
    main()
