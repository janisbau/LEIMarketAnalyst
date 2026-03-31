#!/usr/bin/env python3
"""
process_delta.py — GLEIF Golden Copy delta processor
-----------------------------------------------------
Reads the extracted GLEIF LEI2 delta CSV from ./delta/
Aggregates statistics and writes:
  - data/daily-stats.json  (today's snapshot)
  - data/history.json      (cumulative time-series, append-only)
"""

import csv
import glob
import json
import os
from datetime import date, datetime
from collections import defaultdict

DELTA_DIR = './delta'
DATA_DIR = './data'
DAILY_STATS_FILE = os.path.join(DATA_DIR, 'daily-stats.json')
HISTORY_FILE = os.path.join(DATA_DIR, 'history.json')

# GLEIF LEI2 CSV column names (v2.1 format)
COL_LEI = 'LEI'
COL_MANAGING_LOU = 'Registration.ManagingLOU'
COL_JURISDICTION = 'Entity.LegalJurisdiction'
COL_STATUS = 'Registration.RegistrationStatus'
COL_NEXT_VERSION = 'NextVersion.LEI'  # present in delta files


def find_csv_file():
    """Find the extracted CSV file in the delta directory."""
    patterns = [
        os.path.join(DELTA_DIR, '*.csv'),
        os.path.join(DELTA_DIR, '**', '*.csv'),
    ]
    for pattern in patterns:
        files = glob.glob(pattern, recursive=True)
        if files:
            # Return the largest file (in case of multiple matches)
            return max(files, key=os.path.getsize)
    return None


def process_csv(filepath):
    """Parse the delta CSV and return aggregated statistics."""
    by_lou = defaultdict(int)
    by_country = defaultdict(int)
    status_breakdown = defaultdict(int)
    total = 0

    print(f'Processing: {filepath}')

    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        # Try to detect the delimiter
        sample = f.read(4096)
        f.seek(0)
        delimiter = ',' if sample.count(',') > sample.count('\t') else '\t'

        reader = csv.DictReader(f, delimiter=delimiter)

        for row in reader:
            total += 1

            lei = row.get(COL_LEI, '').strip()
            lou = row.get(COL_MANAGING_LOU, '').strip()
            jurisdiction = row.get(COL_JURISDICTION, '').strip()
            status = row.get(COL_STATUS, '').strip()

            # Country code: GLEIF uses ISO 2-letter codes in LegalJurisdiction
            # Format is either "US" or "US-NY" — take first 2 chars
            country = jurisdiction[:2].upper() if jurisdiction else ''

            if lou:
                by_lou[lou] += 1
            if country:
                by_country[country] += 1
            if status:
                status_breakdown[status] += 1

            if total % 50000 == 0:
                print(f'  Processed {total:,} records...')

    print(f'Total records processed: {total:,}')
    return {
        'totalDelta': total,
        'byLou': dict(by_lou),
        'byCountry': dict(by_country),
        'statusBreakdown': dict(status_breakdown),
    }


def load_history():
    """Load existing history.json, or return empty list."""
    if not os.path.exists(HISTORY_FILE):
        return []
    with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
        try:
            data = json.load(f)
            return data if isinstance(data, list) else []
        except json.JSONDecodeError:
            return []


def save_json(filepath, data):
    """Write JSON file with pretty formatting."""
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f'Written: {filepath}')


def main():
    today = date.today().isoformat()
    print(f'=== GLEIF Delta Processor — {today} ===')

    # Find CSV
    csv_file = find_csv_file()
    if not csv_file:
        print(f'ERROR: No CSV file found in {DELTA_DIR}/')
        print('Expected: ./delta/*.csv after unzipping the GLEIF delta ZIP')
        exit(1)

    # Process
    stats = process_csv(csv_file)
    stats['date'] = today

    # Write daily snapshot
    save_json(DAILY_STATS_FILE, stats)

    # Append to history (skip if today's entry already exists)
    history = load_history()
    existing_dates = {entry.get('date') for entry in history}

    if today in existing_dates:
        print(f'History already has entry for {today}, updating...')
        history = [e for e in history if e.get('date') != today]

    # Only keep summary fields in history (omit large byLou/byCountry to keep file small)
    # Full breakdown is in daily-stats.json; history tracks totals + top-level breakdowns
    history_entry = {
        'date': today,
        'totalDelta': stats['totalDelta'],
        'byLou': stats['byLou'],
        'byCountry': stats['byCountry'],
    }
    history.append(history_entry)

    # Keep only last 730 days (~2 years) to prevent unbounded growth
    history = history[-730:]

    save_json(HISTORY_FILE, history)

    print(f'\nSummary:')
    print(f'  Date:          {today}')
    print(f'  Total records: {stats["totalDelta"]:,}')
    print(f'  LOUs seen:     {len(stats["byLou"])}')
    print(f'  Countries:     {len(stats["byCountry"])}')
    print(f'  History entries: {len(history)}')
    print('Done.')


if __name__ == '__main__':
    main()
