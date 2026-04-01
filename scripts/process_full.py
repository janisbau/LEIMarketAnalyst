#!/usr/bin/env python3
"""
process_full.py — GLEIF Golden Copy FULL file processor (REQ-01, REQ-02, REQ-05, REQ-18)
------------------------------------------------------------------------------------------
Downloads and processes the complete (non-delta) GLEIF LEI2 Golden Copy.
Run monthly via GitHub Actions (update-full.yml).

Writes:
  - data/market-share.json        Cumulative LEI counts + share per LOU
  - data/market-share-history.json Monthly snapshots (append-only, last 36 months)
  - data/entity-types.json        Entity type breakdown per LOU
  - data/renewal-pipeline.json    Expiry counts per LOU per month (next 12 months)
  - data/lou-home-countries.json  Primary country per LOU (where it issues most LEIs)
"""

import csv
import glob
import json
import os
from datetime import date, datetime
from collections import defaultdict
from calendar import monthrange

FULL_DIR = './full'
DATA_DIR = './data'

MARKET_SHARE_FILE      = os.path.join(DATA_DIR, 'market-share.json')
SHARE_HISTORY_FILE     = os.path.join(DATA_DIR, 'market-share-history.json')
ENTITY_TYPES_FILE      = os.path.join(DATA_DIR, 'entity-types.json')
RENEWAL_PIPELINE_FILE  = os.path.join(DATA_DIR, 'renewal-pipeline.json')
HOME_COUNTRIES_FILE    = os.path.join(DATA_DIR, 'lou-home-countries.json')

COL_LEI           = 'LEI'
COL_MANAGING_LOU  = 'Registration.ManagingLOU'
COL_STATUS        = 'Registration.RegistrationStatus'
COL_JURISDICTION  = 'Entity.LegalJurisdiction'
COL_ENTITY_TYPE   = 'Entity.EntityType'
COL_ENTITY_STATUS = 'Entity.EntityStatus'
COL_RENEWAL_DATE  = 'Registration.NextRenewalDate'


def find_csv_file(directory):
    for pattern in [os.path.join(directory, '*.csv'), os.path.join(directory, '**', '*.csv')]:
        files = glob.glob(pattern, recursive=True)
        if files:
            return max(files, key=os.path.getsize)
    return None


def process_full_csv(filepath):
    """Stream-process the full Golden Copy CSV line by line."""
    by_lou_status   = defaultdict(lambda: defaultdict(int))  # {lou: {status: count}}
    by_lou_country  = defaultdict(lambda: defaultdict(int))  # {lou: {country: count}}
    by_lou_type     = defaultdict(lambda: defaultdict(int))  # {lou: {entity_type: count}}
    by_lou_renewal  = defaultdict(lambda: defaultdict(int))  # {lou: {YYYY-MM: count}}
    global_renewal  = defaultdict(int)                        # {YYYY-MM: count}
    global_types    = defaultdict(int)
    total = 0

    today = date.today()
    future_cutoff = date(today.year + 1, today.month, today.day)  # 12 months ahead

    print(f'Processing (streaming): {filepath}')

    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        sample = f.read(4096)
        f.seek(0)
        delimiter = ',' if sample.count(',') > sample.count('\t') else '\t'
        reader = csv.DictReader(f, delimiter=delimiter)

        for row in reader:
            total += 1
            lou    = row.get(COL_MANAGING_LOU, '').strip()
            status = row.get(COL_STATUS, '').strip()
            jur    = row.get(COL_JURISDICTION, '').strip()
            etype  = row.get(COL_ENTITY_TYPE, '').strip()
            renew  = row.get(COL_RENEWAL_DATE, '').strip()
            country = jur[:2].upper() if jur else ''

            if lou and status:
                by_lou_status[lou][status] += 1
            if lou and country:
                by_lou_country[lou][country] += 1
            if lou and etype:
                by_lou_type[lou][etype] += 1
            if etype:
                global_types[etype] += 1

            # Renewal pipeline: only future dates within 12 months
            if renew and lou:
                try:
                    rd = datetime.strptime(renew[:10], '%Y-%m-%d').date()
                    if today <= rd <= future_cutoff:
                        month_key = rd.strftime('%Y-%m')
                        by_lou_renewal[lou][month_key] += 1
                        global_renewal[month_key] += 1
                except ValueError:
                    pass

            if total % 100000 == 0:
                print(f'  Processed {total:,} records...')

    print(f'Total records: {total:,}')
    return {
        'by_lou_status': {k: dict(v) for k, v in by_lou_status.items()},
        'by_lou_country': {k: dict(v) for k, v in by_lou_country.items()},
        'by_lou_type': {k: dict(v) for k, v in by_lou_type.items()},
        'by_lou_renewal': {k: dict(v) for k, v in by_lou_renewal.items()},
        'global_renewal': dict(global_renewal),
        'global_types': dict(global_types),
        'total': total,
    }


def build_market_share(data):
    """Compute market share per LOU from status breakdown."""
    by_lou = {}
    global_active = 0

    for lou, statuses in data['by_lou_status'].items():
        active = statuses.get('ISSUED', 0)
        lapsed = statuses.get('LAPSED', 0) + statuses.get('RETIRED', 0)
        annulled = statuses.get('ANNULLED', 0)
        pending = statuses.get('PENDING_TRANSFER', 0) + statuses.get('PENDING_ARCHIVAL', 0)
        total = sum(statuses.values())
        global_active += active
        by_lou[lou] = {
            'active': active,
            'lapsed': lapsed,
            'annulled': annulled,
            'pending': pending,
            'total': total,
            'share': 0,  # filled in below
        }

    # Compute share (proportion of global active)
    for lou in by_lou:
        if global_active > 0:
            by_lou[lou]['share'] = round(by_lou[lou]['active'] / global_active * 100, 3)

    return {
        'date': date.today().isoformat(),
        'totalActive': global_active,
        'byLou': by_lou,
    }


def build_home_countries(data):
    """Each LOU's home country = country where it issues the most LEIs."""
    home = {}
    for lou, countries in data['by_lou_country'].items():
        if countries:
            home[lou] = max(countries, key=lambda c: countries[c])
    return home


def load_share_history():
    if not os.path.exists(SHARE_HISTORY_FILE):
        return []
    with open(SHARE_HISTORY_FILE, 'r', encoding='utf-8') as f:
        try:
            d = json.load(f)
            return d if isinstance(d, list) else []
        except json.JSONDecodeError:
            return []


def save_json(filepath, data):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f'Written: {filepath}')


def main():
    today = date.today().isoformat()
    month_key = today[:7]  # YYYY-MM
    print(f'=== GLEIF Full Golden Copy Processor — {today} ===')

    csv_file = find_csv_file(FULL_DIR)
    if not csv_file:
        print(f'ERROR: No CSV file found in {FULL_DIR}/')
        exit(1)

    data = process_full_csv(csv_file)

    # Market share
    market_share = build_market_share(data)
    save_json(MARKET_SHARE_FILE, market_share)

    # Market share history (monthly snapshots, last 36 months)
    history = load_share_history()
    history = [e for e in history if e.get('month') != month_key]
    history_entry = {
        'month': month_key,
        'totalActive': market_share['totalActive'],
        'byLou': {lou: {'active': v['active'], 'share': v['share']}
                  for lou, v in market_share['byLou'].items()},
    }
    history.append(history_entry)
    history = history[-36:]
    save_json(SHARE_HISTORY_FILE, history)

    # Entity types
    entity_types = {
        'date': today,
        'byLou': {k: dict(v) for k, v in data['by_lou_type'].items()},
        'global': data['global_types'],
    }
    save_json(ENTITY_TYPES_FILE, entity_types)

    # Renewal pipeline
    renewal_pipeline = {
        'date': today,
        'byLou': {k: dict(v) for k, v in data['by_lou_renewal'].items()},
        'global': data['global_renewal'],
    }
    save_json(RENEWAL_PIPELINE_FILE, renewal_pipeline)

    # Home countries
    home_countries = build_home_countries(data)
    save_json(HOME_COUNTRIES_FILE, home_countries)

    print(f'\nSummary:')
    print(f'  Total LEIs processed: {data["total"]:,}')
    print(f'  Global active:        {market_share["totalActive"]:,}')
    print(f'  LOUs with data:       {len(market_share["byLou"])}')
    print(f'  Home countries mapped:{len(home_countries)}')
    print('Done.')


if __name__ == '__main__':
    main()
