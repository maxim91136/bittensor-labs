import requests
from bs4 import BeautifulSoup
import json
import time

COINGECKO_TREASURY_URL = "https://www.coingecko.com/de/treasuries/bittensor"
OUTPUT_PATH = "treasury_data.json"
FETCH_INTERVAL = 3600  # seconds

def fetch_treasury_data():
    response = requests.get(COINGECKO_TREASURY_URL)
    soup = BeautifulSoup(response.text, "html.parser")
    table = soup.find("table")
    if not table:
        return None
    data = []
    for row in table.find_all("tr")[1:]:  # skip header
        cols = row.find_all("td")
        if len(cols) < 2:
            continue
        treasury = {
            "address": cols[0].get_text(strip=True),
            "amount": cols[1].get_text(strip=True)
        }
        data.append(treasury)
    return data

def save_data(data):
    with open(OUTPUT_PATH, "w") as f:
        json.dump(data, f, indent=2)

def run_worker():
    while True:
        treasury_data = fetch_treasury_data()
        if treasury_data:
            save_data(treasury_data)
            print(f"Treasury data updated: {len(treasury_data)} entries.")
        else:
            print("No treasury data found.")
        time.sleep(FETCH_INTERVAL)

if __name__ == "__main__":
    # For testing: fetch once and print
    data = fetch_treasury_data()
    print(json.dumps(data, indent=2))
    # Uncomment below to run as worker
    # run_worker()
