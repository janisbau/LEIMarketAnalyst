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
from datetime import date
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
COL_NEXT_VERSION = 'NextVersion.LEI'


def find_csv_file():
    """Find the extracted CSV file in the delta directory."""
    for pattern in [os.path.join(DELTA_DIR, '*.csv'), os.path.join(DELTA_DIR, '**', '*.csv')]:
        files = glob.glob(pattern, recursive=True)
        if files:
            return max(files, key=os.path.getsize)
    return None


def process_csv(filepath):
    """Parse the delta CSV and return aggregated statistics."""
    by_lou = defaultdict(int)
    by_country = defaultdict(int)
    by_lou_by_country = defaultdict(lambda: defaultdict(int))  # REQ-09
    by_lou_status = defaultdict(lambda: defaultdict(int))       # REQ-04 per-LOU lapse rates
    status_breakdown = defaultdict(int)
    transfers_out = defaultdict(int)   # REQ-06: PENDING_TRANSFER outflows per LOU
    total = 0

    print(f'Processing: {filepath}')

    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        sample = f.read(4096)
        f.seek(0)
        delimiter = ',' if sample.count(',') > sample.count('\t') else '\t'
        reader = csv.DictReader(f, delimiter=delimiter)

        for row in reader:
            total += 1

            lou = row.get(COL_MANAGING_LOU, '').strip()
            jurisdiction = row.get(COL_JURISDICTION, '').strip()
            status = row.get(COL_STATUS, '').strip()

            country = jurisdiction[:2].upper() if jurisdiction else ''

            if lou:
                by_lou[lou] += 1
            if country:
                by_country[country] += 1
            if status:
                status_breakdown[status] += 1

            # Per-LOU breakdown by country (REQ-09)
            if lou and country:
                by_lou_by_country[lou][country] += 1

            # Per-LOU status breakdown (REQ-04)
            if lou and status:
                by_lou_status[lou][status] += 1

            # Transfer outflows: count PENDING_TRANSFER rows per LOU (REQ-06)
            if lou and status == 'PENDING_TRANSFER':
                transfers_out[lou] += 1

            if total % 50000 == 0:
                print(f'  Processed {total:,} records...')

    print(f'Total records processed: {total:,}')
    return {
        'totalDelta': total,
        'byLou': dict(by_lou),
        'byCountry': dict(by_country),
        'byLouByCountry': {k: dict(v) for k, v in by_lou_by_country.items()},
        'byLouStatus': {k: dict(v) for k, v in by_lou_status.items()},
        'statusBreakdown': dict(status_breakdown),
        'transfers': {
            'outflows': dict(transfers_out),
            'inflows': {},  # inflows require destination LOU from NextVersion.LEI (not in all deltas)
        },
    }


def load_history():
    if not os.path.exists(HISTORY_FILE):
        return []
    with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
        try:
            data = json.load(f)
            return data if isinstance(data, list) else []
        except json.JSONDecodeError:
            return []


def save_json(filepath, data):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f'Written: {filepath}')


def main():
    today = date.today().isoformat()
    print(f'=== GLEIF Delta Processor — {today} ===')

    csv_file = find_csv_file()
    if not csv_file:
        print(f'ERROR: No CSV file found in {DELTA_DIR}/')
        exit(1)

    stats = process_csv(csv_file)
    stats['date'] = today

    save_json(DAILY_STATS_FILE, stats)

    history = load_history()
    existing_dates = {entry.get('date') for entry in history}

    if today in existing_dates:
        print(f'History already has entry for {today}, updating...')
        history = [e for e in history if e.get('date') != today]

    history_entry = {
        'date': today,
        'totalDelta': stats['totalDelta'],
        'byLou': stats['byLou'],
        'byCountry': stats['byCountry'],
        'statusBreakdown': stats['statusBreakdown'],
    }
    history.append(history_entry)
    history = history[-730:]

    save_json(HISTORY_FILE, history)

    print(f'\nSummary:')
    print(f'  Date:            {today}')
    print(f'  Total records:   {stats["totalDelta"]:,}')
    print(f'  LOUs seen:       {len(stats["byLou"])}')
    print(f'  Countries:       {len(stats["byCountry"])}')
    print(f'  Transfer outflows: {sum(stats["transfers"]["outflows"].values())}')
    print(f'  History entries: {len(history)}')
    print('Done.')


if __name__ == '__main__':
    main()
